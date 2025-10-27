# Migration from Google Translate and Gemini to Hugging Face

## Overview
Replaced the paid Google Translate API and Gemini API with free Hugging Face models for both translation and summarization.

## Cost Savings
- **Translation**: Before €0.50-0.75/day → After €0.00
- **Summarization**: Before €0.25-0.35/day → After €0.00
- **Total**: Saving ~€8-11 per month

## Changes Made

### 1. Dependencies (`requirements.txt`)
- Added `transformers==4.46.3` - Hugging Face library
- Added `torch==2.5.1` - PyTorch for model execution
- Added `sentencepiece==0.2.0` - Required for BART tokenization

### 2. Translation Model (`processor.py`)
- Replaced Google Translate API client with Hugging Face MarianMT model
- Model: `Helsinki-NLP/opus-mt-nl-en` (optimized for Dutch to English)
- Uses CPU-only inference (no GPU needed)

### 3. Summarization Model (`processor.py`)
- Replaced Gemini API with Hugging Face BART model
- Model: `sshleifer/distilbart-cnn-12-6` (lightweight, fast)
- Generates 40-150 word summaries for listing cards
- Uses CPU-only inference (no GPU needed)

### 4. Docker Build (`Dockerfile`)
- Pre-downloads both models during Docker build to avoid cold start delays
- Translation model: ~300-500MB, Summarization model: ~500MB
- Models are cached in the container image (~1-1.5GB total)
- No internet downloads required when the job runs

## Performance Considerations

### Memory Usage
- Combined model size: ~1-1.5GB on disk
- RAM usage: ~3-4GB in memory when both models are loaded
- This is acceptable for Cloud Run jobs since you're already using embeddings

### Latency
- First load: Both models are loaded at container startup (takes ~15-30 seconds)
- Subsequent operations: Fast, in-memory inference
- Since it's a daily async job, the startup time is negligible

### Accuracy
- **Translation**: Helsinki-NLP is a high-quality neural model specifically trained for Dutch-English translation. Slight downgrade from Google Translate but very good for real estate listings.
- **Summarization**: DistilBART is a smaller, faster version of BART that produces good abstractive summaries. Slight downgrade from Gemini but generates concise, useful summaries for listing cards.

## Deployment

When you rebuild and redeploy your Docker image:
1. The first build will take longer while downloading both models (~10-15 minutes)
2. Both models will be cached in the Docker image
3. Subsequent runs will have both models ready immediately
4. **Note**: The `GEMINI_API_KEY` environment variable is no longer needed and can be removed from your Cloud Run job configuration

## Testing
The translation function maintains the same interface:
```python
translated_description = translate_text(cleaned_description)
```

It still:
- Detects the language (skips translation if already English)
- Falls back to original text on errors
- Handles empty text gracefully

