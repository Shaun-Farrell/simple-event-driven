# Simple Event Driven Architecture

Simple example of Event-driven architecture using S3, Lambda, DynamoDB, SNS and AWS CDK for deployment.  

![event driven architecture](https://cppstorage.s3-eu-west-1.amazonaws.com/github/event-driven-arch.png)  

### Resources built by this code:
1. S3 Bucket (with a trigger lambda on file created).
2. DynamoDB table with stream (a ledger of all immutable events).
3. Producer Lambdas takes events such as S3 File create and adds event to DynamoDB table.
4. Consumer Lambdas gets triggered by event going on DynamoDB the stream.
Finally events are distibuted e.g via Existing Web Sockets Server or SNS Topic.

### The following existing resources are referenced:  
* There is an existing WebSocket server on APIGateway that is referenced.  
* There is an existing SNS Topic with an email subscription to test sending emails.  

### Prerequisite:

Make sure you have the AWS CLI set up and configured with credentials for your account.  

Install AWS-CDK cli globally  

`npm install -g aws-cdk`  

### Useful commands for AWS-CDK cli:
 * `cdk bootstrap aws://accountID/region` bootstrap assets to S3
 * `npm run test`                         check javascript error using the typescript compiler
 * `npm run test:watch`                   watch for changes and check javascript error using the typescript compiler
 * `cdk deploy`                           deploy this stack to your default AWS account/region
 * `cdk diff`                             compare deployed stack with current state
 * `cdk synth`                            emits the synthesized CloudFormation template
 * `cdk destroy`                          delete the stack
