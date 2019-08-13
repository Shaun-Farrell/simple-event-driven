const dynamodb = require('@aws-cdk/aws-dynamodb');
const lambda = require('@aws-cdk/aws-lambda');
const { S3EventSource } = require('@aws-cdk/aws-lambda-event-sources');
const s3 = require('@aws-cdk/aws-s3');
const IAM = require('@aws-cdk/aws-iam');
const cdk = require('@aws-cdk/core');
const { REST_Api_Handler } = require('./apiGateway-construct');

// Existing services to be referenced (change values in secrets.example.json)
const { WEBSOCKET_ENDPOINT, WEBSOCKET_ARN, TOPIC_ARN, REGION } = require('../secrets.json');

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

    const eventBucket = new s3.Bucket(this, 'digifact-events-bucket', {
        bucketName: 'digifact-events-bucket',
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

    // Lambda to handle items dropped into S3 and write details to DynamoDB
    const produceEventsFromS3Lambda = new lambda.Function(this, 'produceEventsFromS3Lambda', {
      code: new lambda.AssetCode('lambda/producer'),
      handler: 'produceEventsFromS3.handler',
      runtime: lambda.Runtime.NODEJS_10_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(20),
      environment: {
        TABLE_NAME: dynamoTable.tableName,
        PRIMARY_KEY: 'eventGroup',
        SORT_KEY: 'eventType'
      }
    });

    // Consume all events for logging to WS
    const consumeAllEventsLambda = new lambda.Function(this, 'consumeAllEventsLambda', {
      code: new lambda.AssetCode('lambda/consumer'),
      handler: 'consumeAllEvents.handler',
      runtime: lambda.Runtime.NODEJS_10_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(20),
      environment: {
        TABLE_NAME: dynamoTable.tableName,
        PRIMARY_KEY: 'eventGroup',
        SORT_KEY: 'eventType',
        WEBSOCKET_ENDPOINT,
        TOPIC_ARN,
        REGION
      }
    });

    const consumeLabsEventsLambda = new lambda.Function(this, 'consumeLabsEventsLambda', {
      code: new lambda.AssetCode('lambda/consumer'),
      handler: 'consumeLabsEvents.handler',
      runtime: lambda.Runtime.NODEJS_10_X,
      memorySize: 256,
      timeout: cdk.Duration.seconds(20),
      environment: {
        TABLE_NAME: dynamoTable.tableName,
        PRIMARY_KEY: 'eventGroup',
        SORT_KEY: 'eventType',
        WEBSOCKET_ENDPOINT,
        TOPIC_ARN,
        REGION
      }
    });

    produceEventsFromS3Lambda.addEventSource(new S3EventSource(eventBucket, {
      events: [ s3.EventType.OBJECT_CREATED ],
      filters: [ { prefix: '', suffix: '.json' } ]
    }));

    eventBucket.grantRead(produceEventsFromS3Lambda);

    consumeAllEventsLambda.addEventSourceMapping('DynamoDBEvent', {
      batchSize: 100,
      eventSourceArn: dynamoTable.tableStreamArn,
      startingPosition: lambda.StartingPosition.LATEST,
    })

    consumeLabsEventsLambda.addEventSourceMapping('DynamoDBEvent', {
      batchSize: 100,
      eventSourceArn: dynamoTable.tableStreamArn,
      startingPosition: lambda.StartingPosition.LATEST,
    })

    let statement1 = new IAM.PolicyStatement();
    statement1.addActions('dynamodb:ListStreams');
    statement1.addResources('*');
    consumeAllEventsLambda.addToRolePolicy(statement1);
    consumeLabsEventsLambda.addToRolePolicy(statement1);

    let statement2 = new IAM.PolicyStatement();
    statement2.addActions('dynamodb:DescribeStream', 'dynamodb:GetRecords', 'dynamodb:GetShardIterator');
    statement2.addResources(dynamoTable.tableStreamArn);
    consumeAllEventsLambda.addToRolePolicy(statement2);
    consumeLabsEventsLambda.addToRolePolicy(statement2);

    // If the Websockets Arn has been setup lets hookup the WS permissions
    if (!WEBSOCKET_ARN.includes('ACCOUNT_ID')) {
      let statement3 = new IAM.PolicyStatement();
      statement3.addActions('execute-api:*');
      statement3.addResources(WEBSOCKET_ARN);
      consumeAllEventsLambda.addToRolePolicy(statement3);
    }

    // If the topic Arn has been setup lets hookup the SNS permissions
    if (!TOPIC_ARN.includes('ACCOUNT_ID')) {
      let statement4 = new IAM.PolicyStatement();
      statement4.addActions('sns:Publish');
      statement4.addResources(TOPIC_ARN);
      consumeLabsEventsLambda.addToRolePolicy(statement4);
    }

    dynamoTable.grantReadWriteData(produceEventsFromS3Lambda);
    dynamoTable.grantReadWriteData(consumeAllEventsLambda);

    // Add a REST Endpoint to handle a POST that can add an event
    new REST_Api_Handler(this, 'Event-Driven-REST-Api', { DB_TABLE_OBJECT: dynamoTable });

  }
}

module.exports = { EventDrivenStack }