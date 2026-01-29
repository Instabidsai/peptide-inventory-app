
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Load env
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const openaiKey = process.env.OPENAI_API_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);
const openai = new OpenAI({ apiKey: openaiKey });

// Use Python to run yt-dlp module
const PYTHON_CMD = 'python';

function chunkText(text: string, chunkSize: number = 1000, overlap: number = 100): string[] {
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
        const end = Math.min(start + chunkSize, text.length);
        chunks.push(text.slice(start, end));
        start += chunkSize - overlap;
    }
    return chunks;
}

async function downloadAudio(url: string, outputPath: string) {
    return new Promise<void>((resolve, reject) => {
        console.log(`   ⬇️  Spawning yt-dlp (via Python)...`);

        const args = [
            '-m', 'yt_dlp',
            url,
            '--extract-audio',
            '--audio-format', 'mp3',
            '--output', outputPath,
            '--no-check-certificates',
            '--no-warnings',
            '--prefer-free-formats'
        ];

        const proc = spawn(PYTHON_CMD, args, {
            windowsVerbatimArguments: true,
        });

        proc.stderr.on('data', (d) => {
            const text = d.toString();
            if (!text.includes('%') && !text.includes('ETA')) process.stderr.write(text);
        });

        proc.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`yt-dlp exited with code ${code}`));
        });

        proc.on('error', (err) => reject(err));
    });
}

async function processVideo(videoId: string) {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    console.log(`\n🎥 Processing Video: ${url}`);

    // Use relative path to avoid "Space in User Name" issues with yt-dlp
    const relativeAudioPath = `./scripts/temp_${videoId}.mp3`;
    const absoluteAudioPath = resolve(__dirname, `temp_${videoId}.mp3`);

    try {
        await downloadAudio(url, relativeAudioPath);

        if (!fs.existsSync(absoluteAudioPath)) {
            throw new Error("Audio file not created. Download failed.");
        }

        const audioPath = absoluteAudioPath; // Use absolute for fs.read logic

        // Hardcode metadata
        let title = `Video ${videoId}`;
        if (videoId === 'e_p5nJ48_6I') title = "MOTS-C versus Metformin For Longevity";
        if (videoId === 'F3S0p5_9oXk') title = "Retatrutide Needs Carbohydrates to Work Properly";

        let author = "Dr. Trevor Bachmeyer";

        // 2. Transcribe with Whisper
        console.log('   👂 Transcribing with Whisper...');
        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(audioPath),
            model: "whisper-1",
            response_format: "verbose_json",
        });

        const fullText = transcription.text;
        console.log(`   ✅ Transcribed ${fullText.length} chars.`);

        // Cleanup Audio
        try { fs.unlinkSync(audioPath); } catch (e) { }

        // 3. Chunk & Embed
        console.log('   🧠 Vectorizing & Saving...');
        const chunks = chunkText(fullText);

        for (const chunk of chunks) {
            const embeddingResponse = await openai.embeddings.create({
                model: 'text-embedding-3-small',
                input: chunk.replace(/\n/g, ' '),
            });
            const embedding = embeddingResponse.data[0].embedding;

            const { error } = await supabase.from('embeddings').insert({
                content: chunk,
                embedding: embedding,
                metadata: {
                    type: 'global',
                    source: 'youtube_whisper',
                    video_id: videoId,
                    title: title,
                    author: author,
                    url: url,
                    ingested_at: new Date().toISOString()
                }
            });

            if (error) console.error('   ❌ Insert Error:', error.message);
        }
        console.log(`   🎉 Saved ${chunks.length} chunks.`);

    } catch (err) {
        console.log(`   ❌ Failed to process ${videoId}. Details below:`);
        console.error(err);
    }
}

// ... imports ...

async function processLocalFiles() {
    const dropDir = resolve(__dirname, 'audio_drop');

    if (!fs.existsSync(dropDir)) {
        console.log(`❌ Directory not found: ${dropDir}`);
        return;
    }

    const files = fs.readdirSync(dropDir).filter(f => f.endsWith('.mp3') || f.endsWith('.m4a') || f.endsWith('.mp4'));

    if (files.length === 0) {
        console.log('⚠️  No audio files found in scripts/audio_drop. Please drop .mp3 files there!');
        return;
    }

    console.log(`📂 Found ${files.length} local files to ingest.`);

    for (const file of files) {
        const filePath = path.join(dropDir, file);
        console.log(`\n🎧 Processing Local File: ${file}`);

        // Metadata from filename
        const title = file.replace(/\.[^/.]+$/, "").replace(/_/g, " ");
        const author = "Dr. Trevor Bachmeyer (Manual Drop)";

        try {
            // 2. Transcribe with Whisper
            console.log('   👂 Transcribing with Whisper...');
            const transcription = await openai.audio.transcriptions.create({
                file: fs.createReadStream(filePath),
                model: "whisper-1",
                response_format: "verbose_json",
            });

            const fullText = transcription.text;
            console.log(`   ✅ Transcribed ${fullText.length} chars.`);

            // 3. Chunk & Embed
            console.log('   🧠 Vectorizing & Saving...');
            const chunks = chunkText(fullText);

            for (const chunk of chunks) {
                const embeddingResponse = await openai.embeddings.create({
                    model: 'text-embedding-3-small',
                    input: chunk.replace(/\n/g, ' '),
                });
                const embedding = embeddingResponse.data[0].embedding;

                const { error } = await supabase.from('embeddings').insert({
                    content: chunk,
                    embedding: embedding,
                    metadata: {
                        type: 'global',
                        source: 'local_audio_drop',
                        filename: file,
                        title: title,
                        author: author,
                        ingested_at: new Date().toISOString()
                    }
                });

                if (error) console.error('   ❌ Insert Error:', error.message);
            }
            console.log(`   🎉 Saved ${chunks.length} chunks.`);

            // Optional: Move to 'processed' folder?
            // fs.renameSync(filePath, path.join(dropDir, 'processed', file));

        } catch (err) {
            console.error(`   ❌ Failed to process ${file}:`, err);
        }
    }
}

async function main() {
    // Priority: Process Local "Drop" Files first involving the user
    await processLocalFiles();
}

main();
