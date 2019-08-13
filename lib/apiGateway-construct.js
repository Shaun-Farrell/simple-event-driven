const { Construct } = require('@aws-cdk/core');
const apigateway = require('@aws-cdk/aws-apigateway');
const lambda = require('@aws-cdk/aws-lambda');
const cdk = require('@aws-cdk/core');

class REST_Api_Handler extends Construct {
    constructor(scope, id, props) {
        super(scope, id);

        const api = new apigateway.RestApi(this, 'eventsApi', {
            restApiName: 'Events Service'
        });

        const createEvent = new lambda.Function(this, 'produceEventsFromAPIG', {
            code: new lambda.AssetCode('lambda/producer/RESTApi'),
            handler: 'produceEventsFromAPIG.handler',
            runtime: lambda.Runtime.NODEJS_10_X,
            memorySize: 256,
            timeout: cdk.Duration.seconds(20),
            environment: {
                TABLE_NAME: props.DB_TABLE_OBJECT.tableName
            }
        });

        const events = api.root.addResource('events');
        const createEventIntegration = new apigateway.LambdaIntegration(createEvent);
        const createMethod = events.addMethod('POST', createEventIntegration, {
            apiKeyRequired: true
        });
        addCorsOptions(events);
        props.DB_TABLE_OBJECT.grantReadWriteData(createEvent);

        // Setup usage plan
        const key = api.addApiKey('ApiKey');
        const plan = api.addUsagePlan('UsagePlan', {
            name: 'Easy',
            apiKey: key
          });
        // TODO: Add throttling details
        plan.addApiStage({
            stage: api.deploymentStage
        });
    }
}

function addCorsOptions(apiResource) {
    apiResource.addMethod('OPTIONS', new apigateway.MockIntegration({
        integrationResponses: [{
        statusCode: '200',
        responseParameters: {
            'method.response.header.Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent'",
            'method.response.header.Access-Control-Allow-Origin': "'*'",
            'method.response.header.Access-Control-Allow-Credentials': "'false'",
            'method.response.header.Access-Control-Allow-Methods': "'OPTIONS,GET,PUT,POST,DELETE'",
        },
        }],
        passthroughBehavior: apigateway.PassthroughBehavior.NEVER,
        requestTemplates: {
        "application/json": "{\"statusCode\": 200}"
        },
    }), {
        methodResponses: [{
        statusCode: '200',
        responseParameters: {
            'method.response.header.Access-Control-Allow-Headers': true,
            'method.response.header.Access-Control-Allow-Methods': true,
            'method.response.header.Access-Control-Allow-Credentials': true,
            'method.response.header.Access-Control-Allow-Origin': true,
        },  
        }]
    })
}

module.exports = { REST_Api_Handler }