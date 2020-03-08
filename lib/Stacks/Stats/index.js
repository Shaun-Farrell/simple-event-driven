const { Construct } = require("@aws-cdk/core");
const apigateway = require("@aws-cdk/aws-apigateway");
const lambda = require("@aws-cdk/aws-lambda");
const IAM = require("@aws-cdk/aws-iam");
const cdk = require("@aws-cdk/core");
const region = "eu-west-2";
const accId = "380886210955";

class StatsStack extends cdk.Stack {
  /**
   * @param {cdk.App} scope
   * @param {string} id
   * @param {cdk.StackProps=} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);

    // API set to return html
    new Stats_API(this, "Stats_API", {});
  }
}

class Stats_API extends Construct {
  constructor(scope, id, props) {
    super(scope, id);

    const api = new apigateway.RestApi(this, "statsAPI", {
      restApiName: "Stats Service"
    });

    const proxyHandler = new lambda.Function(this, "index", {
      code: new lambda.AssetCode("lambda/frontend"),
      handler: "index.handler",
      runtime: lambda.Runtime.NODEJS_10_X,
      functionName: "events-utils-htmlstats",
      memorySize: 256,
      timeout: cdk.Duration.seconds(30)
    });

    let statement = new IAM.PolicyStatement();
    statement.addActions(
      "dynamodb:BatchGetItem",
      "dynamodb:GetRecords",
      "dynamodb:GetShardIterator",
      "dynamodb:Query",
      "dynamodb:GetItem",
      "dynamodb:Scan",
      "dynamodb:BatchWriteItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem"
    );
    statement.addResources(
      `arn:aws:dynamodb:${region}:${accId}:table/event-items`
    );
    statement.addResources(
      `arn:aws:dynamodb:${region}:${accId}:table/aggregates`
    );
    proxyHandler.addToRolePolicy(statement);

    const statsResource = api.root.addResource("events");
    const proxyIntegration = new apigateway.LambdaIntegration(proxyHandler);
    statsResource.addMethod("GET", proxyIntegration, {});
    addCorsOptions(statsResource);
    // Setup usage plan
    const plan = api.addUsagePlan("UsagePlan", {
      name: "Easy"
    });
    // TODO: Add throttling details
    plan.addApiStage({
      stage: api.deploymentStage
    });
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

module.exports = { StatsStack };
