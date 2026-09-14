import { NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

// Initialize DynamoDB Document Client
const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || '';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const applicationId = searchParams.get('applicationId');

  if (!applicationId) {
    return NextResponse.json({ error: 'Missing applicationId' }, { status: 400 });
  }

  try {
    const command = new GetCommand({
      TableName: TABLE_NAME,
      Key: { application_id: applicationId },
    });

    const response = await docClient.send(command);

    if (!response.Item) {
      // If item is not yet in DDB, it means Lambda is still processing
      return NextResponse.json({ status: 'PROCESSING' }, { status: 200 });
    }

    return NextResponse.json({
      status: response.Item.status,
      analysis_result: response.Item.analysis_result,
    }, { status: 200 });

  } catch (error: any) {
    console.error('Error querying DynamoDB:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}