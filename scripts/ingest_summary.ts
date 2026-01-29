
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import dotenv from 'dotenv';
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

const SUMMARY_TEXT = `
Dr. Trevor Bachmeyer highlights MOTS-C (Mitochondrial-derived peptide) as a crucial agent for health optimization and longevity, often contrasting its benefits with other substances like Metformin and SS-31. He presents MOTS-C as a superior alternative to Metformin for longevity, emphasizing its effectiveness where Metformin might be ineffective or even harmful.

Key aspects and benefits of MOTS-C, according to Dr. Bachmeyer, include:
*   **Combatting Systemic Issues** It provides solutions by targeting systemic inflammation, insulin resistance, and ATP (adenosine triphosphate) shortages.
*   **Cardiac Health** MOTS-C optimizes cardiac metabolism, enhances fatty acid utilization, and significantly boosts ATP production, which is vital for heart function. It also increases ischemic tolerance, making the heart more efficient and resilient.
*   **Neuroprotection and Brain Health** Studies have indicated that MOTS-C possesses substantial neuroprotective effects. It improves whole-body insulin sensitivity, thereby increasing glucose availability for the brain. Additionally, its activation of AMPK in the brain promotes autophagy, aiding in the clearance of cellular debris like misfolded proteins and amyloid plaques associated with conditions like Alzheimer's.
*   **Mitochondrial Function and Metabolic Reset** MOTS-C is presented as essential for resetting metabolic functions. Dr. Bachmeyer emphasizes that MOTS-C should precede SS-31 in treatment protocols, as it fixes the metabolic signal ("steering wheel") before repairing mitochondrial structures. This approach systematically lowers the production of reactive oxygen species that SS-31 might otherwise need to address.
*   **AMPK Activation** A core mechanism of MOTS-C is its forceful activation of the AMPK pathway, which acts as the master switch for cellular energy sensing. Activating AMPK signals the body to optimize energy utilization.
*   **Addressing Root Causes** Rather than just treating symptoms, MOTS-C addresses the root cause of metabolic inefficiency that leads to oxidative stress and mitochondrial damage.
*   **Not for Bodybuilding** He clarifies a common misconception, stating that MOTS-C's primary benefit is not for bodybuilding.

In various "masterclass" discussions, Dr. Bachmeyer underscores the importance of understanding the biological sequence and correct usage of peptides to achieve maximum efficacy and avoid detrimental effects. He advocates for establishing a higher metabolic baseline with MOTS-C before considering other interventions.
`;

async function ingestSummary() {
    console.log('🧠 Vectorizing Web Summary for MOTS-C Masterclass...');

    // Chunk slightly to be safe, though this text fits in one
    const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: SUMMARY_TEXT.replace(/\n/g, ' '),
    });
    const embedding = embeddingResponse.data[0].embedding;

    const { error } = await supabase.from('embeddings').insert({
        content: SUMMARY_TEXT,
        embedding: embedding,
        metadata: {
            type: 'global',
            source: 'web_search_summary',
            title: "MOTS-C Masterclass (Summary)",
            author: "Dr. Trevor Bachmeyer",
            url: "https://www.youtube.com/watch?v=0Wfbn9GjTqs", // Linking to the video
            ingested_at: new Date().toISOString()
        }
    });

    if (error) {
        console.error('❌ Insert Error:', error.message);
    } else {
        console.log('✅ Successfully ingested detailed summary!');
    }
}

ingestSummary();
