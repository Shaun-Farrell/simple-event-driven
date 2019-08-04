#!/usr/bin/env node
const cdk = require('@aws-cdk/core');
const { EventDrivenStack } = require('../lib/event-driven-app-stack');

const app = new cdk.App();
new EventDrivenStack(app, 'EventDrivenStack');
