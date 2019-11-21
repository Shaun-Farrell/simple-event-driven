var aws = require("aws-sdk");
const ddbClient = new aws.DynamoDB.DocumentClient({});
const DDBparse = aws.DynamoDB.Converter.output;
const TABLE_NAME = process.env.TABLE_NAME || "";
const AGGREGATE_TABLE_NAME = process.env.AGGREGATE_TABLE_NAME || "";

async function writeToAggregateTable(formattedObj, combinedKey) {
  return new Promise((resolve, reject) => {
    const dt = new Date();
    const dateUpdated = dt.getTime();

    var params = {
      TableName: AGGREGATE_TABLE_NAME,
      Key: {
        partitionKey: "totalCount",
        sortKey: combinedKey || formattedObj.eventGroup
      },
      UpdateExpression: "set dateUpdated = :dateUpdated add #count :inc",
      ExpressionAttributeNames: {
        "#count": "count"
      },
      ExpressionAttributeValues: {
        ":dateUpdated": dateUpdated,
        ":inc": 1
      }
    };

    ddbClient.update(params, function(err, data) {
      if (err) {
        console.log("Error", err);
        reject(err);
      } else {
        console.log("Success", data);
        resolve(data);
      }
    });
  });
}

// TODO: write errors back to main DB table as error event.

exports.handler = async (event, context) => {
  const eventGroupCountMap = {};
  for (const record of event.Records) {
    console.log(record.eventID);
    console.log(record.eventName);
    console.log("DynamoD Record: %j", record.dynamodb);
    const isRemove = record.eventName === "REMOVE";
    const formattedObj = isRemove
      ? DDBparse({ M: record.dynamodb.OldImage })
      : DDBparse({ M: record.dynamodb.NewImage });
    if (!isRemove && formattedObj.publishToTopic) {
      // TODO: implement bespoke send to subscribers from aggregates table
    }
    if (!isRemove && formattedObj.eventGroup) {
      // TODO: Consider using batching as started below:
      const existingRecord = eventGroupCountMap[formattedObj.eventGroup];
      eventGroupCountMap[formattedObj.eventGroup] = existingRecord
        ? existingRecord + 1
        : 0;
      const promises = [writeToAggregateTable(formattedObj)];
      if (formattedObj.eventType) {
        const origEventType = formattedObj.eventType.split("##")[0];
        if (origEventType) {
          promises.push(
            writeToAggregateTable(
              formattedObj,
              `${formattedObj.eventGroup}##${origEventType}`
            )
          );
        }
      }
      await Promise.all(promises);
    }
  }
  console.log("eventGroupCountMap: ", JSON.stringify(eventGroupCountMap));
  return `Processed ${event.Records.length} records.`;
};
