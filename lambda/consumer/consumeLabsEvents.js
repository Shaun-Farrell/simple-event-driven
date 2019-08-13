var aws = require('aws-sdk');
const ddbClient = new aws.DynamoDB.DocumentClient({});
const DDBparse = aws.DynamoDB.Converter.output;
const TABLE_NAME = process.env.TABLE_NAME || '';
const WEBSOCKET_ENDPOINT = process.env.WEBSOCKET_ENDPOINT || '';
const TOPIC_ARN = process.env.TOPIC_ARN || '';
const REGION = process.env.REGION || 'eu-west-1';

async function publishToSNSTopic(subject, msg) {
    return new Promise( (resolve, reject) => {
        var sns = new aws.SNS({ region: REGION });
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

// We do NOT fan out to WS in this function it is just for:
// 1. Sending notification for SNS subscribers if a labs project has
// 2. More options TBC...
// 3. User promise.all for better concurrency

exports.handler = async (event, context) => {

    if (TOPIC_ARN.includes('ACCOUNT_ID')) {
        return 'TOPIC ARN is incorrect and has not been setup for sending SNS';
    }

    const labsCreateEvents = event.Records.filter(r => r.dynamodb.NewImage && r.dynamodb.NewImage.eventGroup.S === 'labs');
    for (const record of labsCreateEvents) {
        console.log('Record: %j', record);
        const formattedObj = DDBparse({'M':record.dynamodb.NewImage});
        if (formattedObj.publishToTopic && formattedObj.publishToTopic === 'Labs__Group') {
            await publishToSNSTopic('Test from Lambda', `Published for topic: ${formattedObj.publishToTopic}`);
        }
    }

    return `Processed ${labsCreateEvents.length} labs records.`;
};