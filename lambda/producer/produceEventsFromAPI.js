const aws = require("aws-sdk");
const ddbClient = new aws.DynamoDB.DocumentClient({});
const TABLE_NAME = process.env.TABLE_NAME || "";

function getUTCDateTimeString(dt) {
  const year = dt.getUTCFullYear();
  const month = dt.getUTCMonth() + 1;
  const day = dt.getUTCDate();
  const hours = dt.getUTCHours();
  const mins = dt.getUTCMinutes();
  const secs = dt.getUTCSeconds();
  const ms = dt.getUTCMilliseconds();

  let finalString = `${year}${month >= 10 ? month : "0" + month}${
    day >= 10 ? day : "0" + day
  }`;
  finalString += `${hours >= 10 ? hours : "0" + hours}${
    mins >= 10 ? mins : "0" + mins
  }`;
  finalString += `${secs >= 10 ? secs : "0" + secs}${
    ms < 10 ? "00" + ms : ms < 100 ? "0" + ms : ms
  }`;
  return finalString;
}

async function writeToDDB(postBody) {
  return new Promise((resolve, reject) => {
    const { eventGroup, eventType, payload } = postBody;
    if (!eventGroup || !eventType || !payload) {
      reject({
        error:
          "Error writing to DB: must have eventGroup, eventType and payload"
      });
    }

    const dt = new Date();
    const dateCreated = dt.getTime(); // This should only be dateCreated - these events should be immutable
    const rndm = (((1 + Math.random()) * 0x10000) | 0)
      .toString(16)
      .substring(1);
    const evTypeWithDate = `${eventType}##${getUTCDateTimeString(dt)}${rndm}`;
    const params = {
      TableName: TABLE_NAME,
      Item: { ...postBody, eventType: evTypeWithDate, dateCreated }
    };

    ddbClient.put(params, function(err, data) {
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

exports.handler = async event => {
  console.log("event:", event);

  const resp = {
    statusCode: 201,
    headers: {
      "Access-Control-Allow-Origin": "*", // Required for CORS support to work
      "Access-Control-Allow-Credentials": true // Required for cookies, authorization headers with HTTPS
    }
  };

  try {
    const postBody = JSON.parse(event.body);
    const data = await writeToDDB(postBody);
    resp.body = JSON.stringify(data);
    return resp;
  } catch (err) {
    console.log("err:", err);
    resp.statusCode = 500;
    resp.body = JSON.stringify(err);
    return resp;
  }
};
