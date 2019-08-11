const aws = require('aws-sdk');
const s3 = new aws.S3({ apiVersion: '2006-03-01' });
const ddbClient = new aws.DynamoDB.DocumentClient({});
const TABLE_NAME = process.env.TABLE_NAME || '';

function getUTCDateTimeString(dt){
    const year = dt.getUTCFullYear();
    const month = dt.getUTCMonth() + 1;
    const day = dt.getUTCDate();
    const hours = dt.getUTCHours();
    const mins = dt.getUTCMinutes();
    const secs = dt.getUTCSeconds();
    const ms = dt.getUTCMilliseconds();

    let finalString = `${year}${month >= 10 ? month : '0'+month}${day >= 10 ? day : '0'+day}`;
    finalString += `${hours >= 10 ? hours : '0'+hours}${mins >= 10 ? mins : '0'+mins}`;
    finalString += `${secs >= 10 ? secs : '0'+secs}${ms >= 10 ? ms : '0'+ms}`;
    return finalString;
}

async function writeToDDB(postBody) {

    return new Promise( (resolve, reject) => {
        const { eventGroup, eventType, payload } = postBody;
        if (!eventGroup || !eventType || !payload) {
            const errMsg = 'Error writing to DB: must have eventGroup, eventType and payload';
            reject({ error: 'Error writing to DB: must have eventGroup, eventType and payload' });
        }

        const dt = new Date();
        const dateCreated = dt.getTime(); // This should only be dateCreated - these events should be immutable
        const evTypeWithDate = `${eventType}##${getUTCDateTimeString(dt)}`;
        const params = {
            TableName: TABLE_NAME,
            Item: { ...postBody, eventType: evTypeWithDate, dateCreated }
        };

        // Call DynamoDB to add the item to the table
        ddbClient.put(params, function(err, data) {
            if (err) {
                console.log("Error", err);
                reject(err)
            } else {
                console.log("Success", data);
                resolve(data);
            }
        });
    })
}

exports.handler = async (event) => {
    console.log('event:', event);

    try {
        const postBody = JSON.parse(event.body);
        const data = await writeToDDB(postBody);
        return { statusCode: 201, body: JSON.stringify(data) };
    } catch (err) {
        console.log('err:', err);
        return { statusCode: 500, body: JSON.stringify(err) };
    }
};
