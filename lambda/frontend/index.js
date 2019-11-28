const fs = require("fs");
var aws = require("aws-sdk");
const ddbClient = new aws.DynamoDB.DocumentClient({});
let html;

function loadHtml() {
  if (!html) {
    console.log("loading index.html...");
    html = fs.readFileSync("static/index.html", "utf-8");
    console.log("loaded");
  }
  return html;
}

function generateTableRow(name, count) {
  return `<tr>
    <td>${name}</td>
    <td>${count}</td>
    </tr>`;
}

function generateTable() {
  return `<table class="table">
  <thead>
    <tr>
      <th scope="col">Name</th>
      <th scope="col">Count</th>
    </tr>
  </thead>
  <tbody>
    ##ROWDATA##
  </tbody>
</table>`;
}

async function readFromDDB(pk, sk, tableName, pkName, skName) {
  return new Promise((resolve, reject) => {
    const params = {
      TableName: tableName,
      KeyConditionExpression: `${pkName} = :grpValue`,
      ExpressionAttributeValues: {
        ":grpValue": pk
      }
    };

    if (sk) {
      params.ExpressionAttributeValues[`:${skName}`] = sk;
      params.KeyConditionExpression += ` and begins_with(${skName}, :${skName})`;
    }

    ddbClient.query(params, function(err, data) {
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

module.exports.handler = async (event, context) => {
  const template = loadHtml();

  const response = {
    statusCode: 200,
    headers: {
      "content-type": "text/html; charset=UTF-8"
    }
  };

  const { queryStringParameters } = event;
  const { pk, sk, agg } = queryStringParameters || {};

  if (!pk) {
    response.body = "pk required";
    response.statusCode = 400;
    return response;
  }

  const pkName = agg ? "partitionKey" : "eventGroup";
  const skName = agg ? "sortKey" : "eventType";
  const tableName = agg ? "aggregates" : "event-items";

  try {
    const data = await readFromDDB(pk, sk, tableName, pkName, skName);
    const rowData = data.Items.map(rec => {
      if (agg) {
        return generateTableRow(rec.sortKey, rec.count);
      } else {
        return generateTableRow(rec.eventType, rec.eventGroup);
      }
    });
    const tableData = generateTable().replace("##ROWDATA##", rowData.join(""));
    const res = template.replace("##TABLE##", tableData);
    response.body = res;
    return response;
  } catch (error) {
    response.body = JSON.stringify(error);
    response.statusCode = 400;
    return response;
  }
};
