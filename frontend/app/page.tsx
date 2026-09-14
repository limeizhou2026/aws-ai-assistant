'use client';

import { useState } from 'react';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [aiResult, setAiResult] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setAiResult(null);
      setStatusMessage(`Selected file: ${e.target.files[0].name}`);
    }
  };

  const handleUploadAndAnalyze = async () => {
    if (!file) {
      alert('Please select a PDF resume first!');
      return;
    }

    setIsUploading(true);
    setStatusMessage('1. Requesting secure presigned upload URL from AWS...');

    try {
      const res = await fetch('/api/get-presigned-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: file.name, filetype: file.type }),
      });
      
      if (!res.ok) throw new Error('Failed to retrieve presigned URL');
      const { uploadUrl } = await res.json();

      setStatusMessage('2. Channel established. Uploading resume directly to Amazon S3...');

      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });

      if (!uploadRes.ok) throw new Error('Failed to upload file to S3');

      setStatusMessage('3. Upload successful! AWS SQS triggered Lambda Agent. Deep auditing resume (Est. 15-30s)...');
      
      // Simulated response placeholder (Ready to be wired up with DynamoDB fetching)
      setTimeout(() => {
        setAiResult(`### 🚀 Claude 3.5 Sonnet Resume Audit Report\n\n**[Critical Gaps]**\n1. Distributed Systems: Mentioned full-stack development, but lacked concrete handling of data consistency in high-concurrency scenarios.\n2. Cloud-Native Architecture: Did not highlight hands-on experience with IaC frameworks (e.g., AWS CDK/Terraform).\n\n**[Optimized Cover Letter Hook]**\n"Dear Hiring Manager, I am thrilled to express my interest in the Full Stack position. With my hands-on experience in AWS Serverless architecture..."`);
        setIsUploading(false);
        setStatusMessage('Analysis complete!');
      }, 5000);

    } catch (error) {
      console.error(error);
      setStatusMessage('An error occurred. Please check your AWS credentials or local configuration.');
      setIsUploading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-6 text-white">
      <div className="text-center mb-10">
        <h1 className="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-500 bg-clip-text text-transparent">
          AWS Agentic Job Assistant
        </h1>
        <p className="mt-2 text-slate-400 text-sm">
          Enterprise-grade AWS serverless decoupled architecture for AI-powered resume auditing.
        </p>
      </div>

      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
        <div className="border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-xl p-8 text-center cursor-pointer transition relative bg-slate-950/50">
          <input 
            type="file" 
            accept=".pdf"
            onChange={handleFileChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <p className="text-slate-300 font-medium">Click or drag & drop your PDF resume here</p>
          <p className="text-slate-500 text-xs mt-1">Standard PDF format files only</p>
        </div>

        {statusMessage && (
          <div className="mt-4 text-sm text-indigo-400 font-mono text-center">
            {statusMessage}
          </div>
        )}

        <button
          onClick={handleUploadAndAnalyze}
          disabled={isUploading}
          className={`w-full mt-6 py-3 px-4 rounded-xl font-bold transition-all text-white ${
            isUploading 
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
              : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-lg shadow-indigo-500/20'
          }`}
        >
          {isUploading ? 'Agent is thinking...' : 'Start AI Smart Audit'}
        </button>
      </div>

      {aiResult && (
        <div className="w-full max-w-2xl mt-8 bg-slate-900 border border-emerald-900/30 rounded-2xl p-8 shadow-2xl">
          <div className="text-emerald-400 font-bold mb-3 flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            AI Analysis Report Ready:
          </div>
          <div className="text-slate-300 whitespace-pre-wrap font-sans leading-relaxed text-sm bg-slate-950 p-4 rounded-xl border border-slate-800">
            {aiResult}
          </div>
        </div>
      )}
    </main>
  );
}