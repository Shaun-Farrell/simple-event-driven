const fs = require("fs");
const https = require("https");
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

function generateTable(data) {
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

function getData(url) {
  return new Promise(function(resolve, reject) {
    let data = "";
    https
      .get(
        url,
        {
          headers: { "x-api-key": "qYwvX51WLHaKNMdswJOzkJ4B5wRHxEj9OP2dH9De" }
        },
        resp => {
          // A chunk of data has been recieved.
          resp.on("data", chunk => {
            data += chunk;
          });

          // The whole response has been received. Print out the result.
          resp.on("end", () => {
            resolve(data);
          });
        }
      )
      .on("error", err => {
        reject(err);
      });
  });
}

module.exports.handler = async (event, context) => {
  const template = loadHtml();
  const eventString = JSON.stringify(event);
  const { queryStringParameters } = event;
  const { pk, sk } = queryStringParameters || {};
  // Use these query params if set to filter results

  const data = await getData(
    `https://api.nrdigital.co/v1/events/aggregates?pk=${pk ||
      "totalCount"}&sk=${sk || ""}`
  );
  const parsedData = JSON.parse(data);
  const rowData = parsedData.map(rec => {
    return generateTableRow(rec.sortKey, rec.count);
  });
  const tableData = generateTable(parsedData).replace(
    "##ROWDATA##",
    rowData.join("")
  );
  const res = template.replace("##TABLE##", tableData);

  const response = {
    statusCode: 200,
    headers: {
      "content-type": "text/html; charset=UTF-8"
    },
    body: res
  };

  return response;
};
