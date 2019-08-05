var aws = require('aws-sdk');
const ddbClient = new aws.DynamoDB.DocumentClient({});
const DDBparse = aws.DynamoDB.Converter.output;
const TABLE_NAME = process.env.TABLE_NAME || '';
const WEBSOCKET_ENDPOINT = process.env.WEBSOCKET_ENDPOINT || '';
const TOPIC_ARN = process.env.TOPIC_ARN || '';

// Post to WebSockets via APIGateway
function postToAPIGateway(body, path) {

    const prom = new Promise(function(resolve, reject) {
        var esDomain = {
            endpoint: WEBSOCKET_ENDPOINT,
            region: 'eu-west-1',
        };
        var endpoint =  new aws.Endpoint(esDomain.endpoint);
        var req = new aws.HttpRequest(endpoint);

        req.method = 'POST';
        req.path = path;
        req.region = esDomain.region;
        req.body = body;
        req.headers['presigned-expires'] = false;
        req.headers['Host'] = endpoint.host;

        // Sign the request (Sigv4)
        var signer = new aws.Signers.V4(req, 'execute-api');
        signer.addAuthorization(aws.config.credentials, new Date());

        var send = new aws.NodeHttpClient();
        send.handleRequest(req, null, function(httpResp) {
            httpResp.on('data', function (chunk) {
                const content = Buffer.from(chunk, "utf8").toString();
                reject(content);
            });
            httpResp.on('end', function (dt) {
                resolve('done');
            });
            httpResp.on('error', function (e) {
                console.log('e: ', e);
                reject(e);
            });
        }, function(err) {
            console.log('Error: ' + err);
            reject(err);
        });
    });

    return prom;
}

// Get all open websockets connections are maintained in the DynamoDB
async function getAllConnections() {
    return new Promise( (resolve, reject) => {
        var params = {
          TableName: TABLE_NAME,
          KeyConditionExpression: 'eventGroup = :grpValue',
          ExpressionAttributeValues: {
            ':grpValue': 'connection'
          }
        };

        ddbClient.query(params, function(err, data) {
            if (err) {
                console.log("Err", err);
                reject(err);
            } else {
                console.log("Success", JSON.stringify(data));
                resolve(data);
            }
        });
    });
}

async function fanoutToWS(record, formattedObj) {
    // Get all active connections and send message
    try {
        const rows = await getAllConnections();
        if (rows.Items){
          for (const item of rows.Items) {
            await postToAPIGateway(
                `DynamoDB ${record.eventName}: ${JSON.stringify(formattedObj)}`, 
                `/dev/@connections/${item.connectionID}`
            );
          }
        }
    }
    catch (e) {
        console.log('error sending to WS: ', e);
    }
}
async function publishToSNSTopic(subject, msg) {
    return new Promise( (resolve, reject) => {
        var sns = new aws.SNS({ region: "eu-west-1" });
        var params = {
            Subject: subject,
            Message: msg,
            TopicArn: TOPIC_ARN
        };
        sns.publish(params, function(err, data) {
            if (err) {
                console.log('err: ', err);
                reject(err);
            } else {
                console.log(data);
                resolve(data)
            }
        });
    })
}

exports.handler = async (event, context) => {
    for (const record of event.Records) {
        console.log(record.eventID);
        console.log(record.eventName);
        console.log('DynamoD Record: %j', record.dynamodb);
        const isRemove = record.eventName === 'REMOVE';
        const formattedObj = isRemove ? DDBparse({'M':record.dynamodb.OldImage}) : DDBparse({'M':record.dynamodb.NewImage});
        if (WEBSOCKET_ENDPOINT !== '' && !WEBSOCKET_ENDPOINT.includes('API_ID')){
            await fanoutToWS(record, formattedObj);
        }
        if (!isRemove && formattedObj.publishToTopic && !TOPIC_ARN.includes('ACCOUNT_ID')){
            if (formattedObj.publishToTopic === 'app-group') {
                await publishToSNSTopic('Test from Lambda', `Published for topic: ${formattedObj.publishToTopic}`);
            }
        }
    }

    return `Processed ${event.Records.length} records.`;
};