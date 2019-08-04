const dynamodb = require('@aws-cdk/aws-dynamodb');
const lambda = require('@aws-cdk/aws-lambda');
const { S3EventSource } = require('@aws-cdk/aws-lambda-event-sources');
const s3 = require('@aws-cdk/aws-s3');
const IAM = require('@aws-cdk/aws-iam');
const cdk = require('@aws-cdk/core');
// Existing services to be referenced (change values in secrets.example.json)
const { WEBSOCKET_ENDPOINT, WEBSOCKET_ARN, TOPIC_ARN } = require('../secrets.json');

class EventDrivenStack extends cdk.Stack {
  /**
   * @param {cdk.App} scope
   * @param {string} id
   * @param {cdk.StackProps=} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);

    // Resources built:
    // 1. S3 Bucket (trigger lambda on file created).
    // 2. DynamoDB table with stream (a ledger of all immutable events).
    // 3. Producer Lambdas take events such as S3 File create and adds event to DynamoDB table.
    // 4. Consumer Lambdas get triggered by events going on DynamoDB the stream.
    // Finally events are distibuted e.g via Existing Web Sockets Server or SNS Topic (Existing resources)

    const eventBucket = new s3.Bucket(this, 'cp-events-bucketv2', {
        bucketName: 'cp-events-bucketv2',
        removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

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
    if (!TOPIC_ARN.includes('ACCOUNT-ID')) {
      consumeAppEventsLambda.addToRolePolicy(statement3);
    }

    let statement4 = new IAM.PolicyStatement();
    statement4.addActions('sns:Publish');
    statement4.addResources(TOPIC_ARN);
    if (!TOPIC_ARN.includes('ACCOUNT-ID')) {
      consumeAppEventsLambda.addToRolePolicy(statement4);
    }

    dynamoTable.grantReadWriteData(produceAppEventsLambda);
    dynamoTable.grantReadWriteData(consumeAppEventsLambda);

  }
}

module.exports = { EventDrivenStack }
