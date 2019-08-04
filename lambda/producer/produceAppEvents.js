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

async function writeToDDB(fileContent) {

    return new Promise( (resolve, reject) => {
        const fileContentObj = JSON.parse(fileContent);
        const { eventGroup, eventType, payload } = fileContentObj;
        if (!eventGroup || !eventType || !payload) {
            console.log('Error writing to DB: must have eventGroup, eventType and payload');
            reject();
        }

        const dt = new Date();
        const dateCreated = dt.getTime(); // This should only be dateCreated - these events should be immutable
        const evTypeWithDate = `${eventType}##${getUTCDateTimeString(dt)}`;
        const params = {
            TableName: TABLE_NAME,
            Item: { ...fileContentObj, eventType: evTypeWithDate, dateCreated }
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

async function getClientFile(fileName, index) {
    console.log(`Processing Item: ${index}`);
    const bucket = 'cp-events-bucketv2';
    const key = fileName;
    const params = {
        Bucket: bucket,
        Key: key,
    };
    var content = '';
    try {
        const obj = await s3.getObject(params).promise();
        console.log('CONTENT TYPE:', obj);
        content = Buffer.from(obj.Body, "utf8").toString();
        console.log('CONTENT:', content);
       
    } catch (err) {
        console.log('err:', err);
        return;
    }

    await writeToDDB(content);
    return content;
}

exports.handler = async (event) => {
    console.log('event:', event);
    // Loop through the S3 objects for processing into DynamoDB
    let x=1;
    if (event.Records){
        for (const record of event.Records) {
            await getClientFile(record.s3.object.key, x);
            x++;
        }
    }

    return `Successfully processed file received in S3`;
};
