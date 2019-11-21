const dynamodb = require('@aws-cdk/aws-dynamodb');
const lambda = require('@aws-cdk/aws-lambda');
const { S3EventSource } = require('@aws-cdk/aws-lambda-event-sources');
const s3 = require('@aws-cdk/aws-s3');
const IAM = require('@aws-cdk/aws-iam');
const cdk = require('@aws-cdk/core');
// Existing services to be referenced (change values in secrets.example.json)
const { WEBSOCKET_ENDPOINT, WEBSOCKET_ARN, TOPIC_ARN } = require('../secrets.example.json');

class EventDrivenStack extends cdk.Stack {
  /**
   * @param {cdk.App} scope
   * @param {string} id
   * @param {cdk.StackProps=} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);

    // RESOURCE BUILT (1): DynamoDB Table - acts as a unified log for storing all events. This also has a stream.
    // RESOURCE BUILT (2): DynamoDB Table - for storing config (feature flags, subscriber details) and aggregate counts.
    // RESOURCE BUILT (3): Producer Lambda adds events to DynamoDB from events triggered from API Gateway
    // RESOURCE BUILT (4): Consumer Lambda one multipurpose consumer reading from the DB stream. 
    // RESOURCE BUILT (4): It handles writing aggregates and sending out to subscribers.
    // Can add more specialist consumers.

    const dynamoTable = new dynamodb.Table(this, 'event-items', {
      partitionKey: {
        name: 'eventGroup',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'eventType',
        type: dynamodb.AttributeType.STRING
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      tableName: 'event-items',
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES
    });

    const produceAppEventsLambda = new lambda.Function(this, 'produceAppEventsLambda', {
      code: new lambda.AssetCode('lambda/producer'),
      handler: 'produceAppEvents.handler',
      runtime: lambda.Runtime.NODEJS_10_X,
      memorySize: 256,
      environment: {
        TABLE_NAME: dynamoTable.tableName,
        PRIMARY_KEY: 'eventGroup',
        SORT_KEY: 'eventType'
      }
    });

    const consumeAppEventsLambda = new lambda.Function(this, 'consumeAppEventsLambda', {
      code: new lambda.AssetCode('lambda/consumer'),
      handler: 'consumeAppEvents.handler',
      runtime: lambda.Runtime.NODEJS_10_X,
      memorySize: 256,
      environment: {
        TABLE_NAME: dynamoTable.tableName,
        PRIMARY_KEY: 'eventGroup',
        SORT_KEY: 'eventType',
        WEBSOCKET_ENDPOINT,
        TOPIC_ARN
      }
    });

    produceAppEventsLambda.addEventSource(new S3EventSource(eventBucket, {
      events: [ s3.EventType.OBJECT_CREATED ],
      filters: [ { prefix: 'app-group/', suffix: '.json' } ] // optional
    }));

    eventBucket.grantRead(produceAppEventsLambda);

    consumeAppEventsLambda.addEventSourceMapping('DynamoDBEvent', {
      batchSize: 100,
      eventSourceArn: dynamoTable.tableStreamArn,
      startingPosition: lambda.StartingPosition.LATEST,
    })

    let statement1 = new IAM.PolicyStatement();
    statement1.addActions('dynamodb:ListStreams');
    statement1.addResources('*');
    consumeAppEventsLambda.addToRolePolicy(statement1);

    let statement2 = new IAM.PolicyStatement();
    statement2.addActions('dynamodb:DescribeStream', 'dynamodb:GetRecords', 'dynamodb:GetShardIterator');
    statement2.addResources(dynamoTable.tableStreamArn);
    consumeAppEventsLambda.addToRolePolicy(statement2);

    let statement3 = new IAM.PolicyStatement();
    statement3.addActions('execute-api:*');
    statement3.addResources(WEBSOCKET_ARN);
    if (!TOPIC_ARN.includes('ACCOUNT_ID')) {
      consumeAppEventsLambda.addToRolePolicy(statement3);
    }

    let statement4 = new IAM.PolicyStatement();
    statement4.addActions('sns:Publish');
    statement4.addResources(TOPIC_ARN);
    if (!TOPIC_ARN.includes('ACCOUNT_ID')) {
      consumeAppEventsLambda.addToRolePolicy(statement4);
    }

    dynamoTable.grantReadWriteData(produceAppEventsLambda);
    dynamoTable.grantReadWriteData(consumeAppEventsLambda);

  }
}

module.exports = { EventDrivenStack }
