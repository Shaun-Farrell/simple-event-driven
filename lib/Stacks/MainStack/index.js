const dynamodb = require("@aws-cdk/aws-dynamodb");
const lambda = require("@aws-cdk/aws-lambda");
const IAM = require("@aws-cdk/aws-iam");
const cdk = require("@aws-cdk/core");
const apigateway = require("@aws-cdk/aws-apigateway");

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

    const dynamoTable = new dynamodb.Table(this, "event-items", {
      partitionKey: {
        name: "eventGroup",
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: "eventType",
        type: dynamodb.AttributeType.STRING
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      tableName: "event-items",
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES
    });

    // Second table for storing aggregates and config
    const aggregateTable = new dynamodb.Table(this, "aggregates", {
      partitionKey: {
        name: "partitionKey",
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: "sortKey",
        type: dynamodb.AttributeType.STRING
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      tableName: "aggregates"
    });

    // Producer Lambda which handles requests from API Gateway and creates event in DB
    const produceAppEventsLambda = new lambda.Function(
      this,
      "produceEventsFromAPI",
      {
        code: new lambda.AssetCode("lambda/producer"),
        handler: "produceEventsFromAPI.handler",
        runtime: lambda.Runtime.NODEJS_10_X,
        memorySize: 256,
        timeout: cdk.Duration.seconds(30),
        environment: {
          TABLE_NAME: dynamoTable.tableName
        }
      }
    );

    // Consumer Lambda that reads from the DB Stream.
    const consumeAllEventsLambda = new lambda.Function(
      this,
      "consumeAllEventsLambda",
      {
        code: new lambda.AssetCode("lambda/consumer"),
        handler: "consumeAllEvents.handler",
        runtime: lambda.Runtime.NODEJS_10_X,
        memorySize: 256,
        timeout: cdk.Duration.seconds(30),
        environment: {
          TABLE_NAME: dynamoTable.tableName,
          AGGREGATE_TABLE_NAME: aggregateTable.tableName
        }
      }
    );

    // Stream mapping to lamda
    consumeAllEventsLambda.addEventSourceMapping("DynamoDBEvent", {
      batchSize: 100,
      eventSourceArn: dynamoTable.tableStreamArn,
      startingPosition: lambda.StartingPosition.LATEST
    });

    // API for HTTP requests (Add AUTH in PROD)
    const api = new apigateway.RestApi(this, "eventsApi", {
      restApiName: "Events Service"
    });

    const events = api.root.addResource("events");
    const createEventIntegration = new apigateway.LambdaIntegration(
      produceAppEventsLambda
    );
    events.addMethod("POST", createEventIntegration, {
      apiKeyRequired: false
    });

    addCorsOptions(events);
    const plan = api.addUsagePlan("UsagePlan", {
      name: "Easy"
    });
    plan.addApiStage({
      stage: api.deploymentStage
    });

    // IAM Permissions
    let statement1 = new IAM.PolicyStatement();
    statement1.addActions("dynamodb:ListStreams");
    statement1.addResources("*");
    consumeAllEventsLambda.addToRolePolicy(statement1);

    let statement2 = new IAM.PolicyStatement();
    statement2.addActions(
      "dynamodb:DescribeStream",
      "dynamodb:GetRecords",
      "dynamodb:GetShardIterator"
    );
    statement2.addResources(dynamoTable.tableStreamArn);
    consumeAllEventsLambda.addToRolePolicy(statement2);

    dynamoTable.grantReadWriteData(produceAppEventsLambda);
    dynamoTable.grantReadWriteData(consumeAllEventsLambda);
  }
}

function addCorsOptions(apiResource) {
  apiResource.addMethod(
    "OPTIONS",
    new apigateway.MockIntegration({
      integrationResponses: [
        {
          statusCode: "200",
          responseParameters: {
            "method.response.header.Access-Control-Allow-Headers":
              "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent'",
            "method.response.header.Access-Control-Allow-Origin": "'*'",
            "method.response.header.Access-Control-Allow-Credentials":
              "'false'",
            "method.response.header.Access-Control-Allow-Methods":
              "'OPTIONS,GET,PUT,POST,DELETE'"
          }
        }
      ],
      passthroughBehavior: apigateway.PassthroughBehavior.NEVER,
      requestTemplates: {
        "application/json": '{"statusCode": 200}'
      }
    }),
    {
      methodResponses: [
        {
          statusCode: "200",
          responseParameters: {
            "method.response.header.Access-Control-Allow-Headers": true,
            "method.response.header.Access-Control-Allow-Methods": true,
            "method.response.header.Access-Control-Allow-Credentials": true,
            "method.response.header.Access-Control-Allow-Origin": true
          }
        }
      ]
    }
  );
}

module.exports = { EventDrivenStack };
