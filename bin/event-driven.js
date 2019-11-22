#!/usr/bin/env node
const cdk = require("@aws-cdk/core");
const { EventDrivenStack } = require("../lib/Stacks/MainStack");
const { StatsStack } = require("../lib/Stacks/Stats");

const app = new cdk.App();
new EventDrivenStack(app, "EventDrivenStack");
new StatsStack(app, "StatsStack");
