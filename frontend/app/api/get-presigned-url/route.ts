import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Initialize S3 client (Credentials will be picked up automatically from local AWS CLI config or environment variables)
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || ''; // We will configure this in .env.local

export async function POST(request: Request) {
  try {
    const { filename, filetype } = await request.json();

    if (!filename || !filetype) {
      return NextResponse.json(
        { error: 'Missing filename or filetype' },
        { status: 400 }
      );
    }

    // Define a unique object key (path in S3)
    const objectKey = `uploads/${Date.now()}-${filename}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: objectKey,
      ContentType: filetype,
    });

    // Generate a presigned URL valid for 60 seconds
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 });

    return NextResponse.json({ uploadUrl, objectKey }, { status: 200 });
  } catch (error: any) {
    console.error('Error generating presigned URL:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}