#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { HandTermCdkStack } from '../lib/cdk-stack.js';

const app = new cdk.App();
new HandTermCdkStack(app, 'HandTermCdkStack');
