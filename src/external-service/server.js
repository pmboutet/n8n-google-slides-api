/**
 * External Google Slides Service for Complex Operations
 * 
 * This lightweight Express.js service handles complex layout matching
 * and slide generation that might be too heavy for n8n Function nodes.
 * 
 * Deploy this service independently and call from n8n HTTP Request nodes.
 */

const express = require('express');
const { google } = require('googleapis');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 3000;

// Import our core classes
const SlidesClient = require('../core/slides-client');
const LayoutAnalyzer = require('../core/layout-analyzer');
const ContentMatcher = require('../core/content-matcher');

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Extract layouts from presentation
app.post('/api/extract-layouts', async (req, res) => {
  try {
    const { presentationId, accessToken } = req.body;
    
    if (!presentationId || !accessToken) {
      return res.status(400).json({
        error: 'presentationId and accessToken are required'
      });
    }

    const client = new SlidesClient(accessToken);
    const presentation = await client.getPresentation(presentationId);
    
    const layouts = LayoutAnalyzer.extractLayouts(presentation);
    const categorized = LayoutAnalyzer.categorizeLayouts(layouts);
    const stats = LayoutAnalyzer.getLayoutStats(layouts);

    res.json({
      success: true,
      presentationId,
      presentationTitle: presentation.title,
      layouts,
      categorized,
      stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Layout extraction error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Advanced layout matching with ML-style scoring
app.post('/api/match-layout', async (req, res) => {
  try {
    const { content, layouts, options = {} } = req.body;
    
    if (!content || !layouts) {
      return res.status(400).json({
        error: 'content and layouts are required'
      });
    }

    // Enhanced content analysis
    const contentAnalysis = ContentMatcher.analyzeContent(content);
    
    // Apply custom scoring if provided
    if (options.customWeights) {
      ContentMatcher.SCORING_WEIGHTS = { 
        ...ContentMatcher.SCORING_WEIGHTS, 
        ...options.customWeights 
      };
    }

    const matchResult = ContentMatcher.findBestLayout(content, layouts);
    
    // Add confidence metrics
    const confidence = calculateConfidence(matchResult.bestLayout.score, layouts.length);
    
    // Generate detailed explanation
    const explanation = generateDetailedExplanation(contentAnalysis, matchResult.bestLayout, layouts);

    res.json({
      success: true,
      selectedLayout: matchResult.bestLayout,
      alternatives: matchResult.alternatives,
      contentAnalysis,
      confidence,
      explanation,
      reasoning: matchResult.reasoning,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Layout matching error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Complete slide creation workflow
app.post('/api/create-slide', async (req, res) => {
  try {
    const { presentationId, content, accessToken, options = {} } = req.body;
    
    if (!presentationId || !content || !accessToken) {
      return res.status(400).json({
        error: 'presentationId, content, and accessToken are required'
      });
    }

    const client = new SlidesClient(accessToken);
    
    // Step 1: Extract layouts
    const presentation = await client.getPresentation(presentationId);
    const layouts = LayoutAnalyzer.extractLayouts(presentation);
    
    if (layouts.length === 0) {
      throw new Error('No layouts found in presentation');
    }

    // Step 2: Match layout
    const matchResult = ContentMatcher.findBestLayout(content, layouts);
    const selectedLayout = matchResult.bestLayout;

    // Step 3: Create slide
    const slideId = generateUniqueId();
    const requests = buildSlideRequests(slideId, selectedLayout, content, options);

    // Step 4: Execute batch update
    const batchResponse = await client.batchUpdate(presentationId, requests);
    
    // Generate response
    const slideUrl = client.generateSlideUrl(presentationId, slideId);
    const confidence = calculateConfidence(selectedLayout.score, layouts.length);

    res.json({
      success: true,
      slideId,
      slideUrl,
      presentationId,
      presentationTitle: presentation.title,
      layoutUsed: {
        objectId: selectedLayout.objectId,
        displayName: selectedLayout.displayName,
        score: selectedLayout.score
      },
      contentAnalysis: matchResult.contentAnalysis,
      confidence,
      reasoning: matchResult.reasoning,
      elementsCreated: requests.length - 1, // Exclude createSlide request
      batchUpdateResponse: {
        requestsExecuted: batchResponse.replies?.length || 0,
        success: Boolean(batchResponse.replies)
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Slide creation error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      presentationId: req.body.presentationId,
      timestamp: new Date().toISOString()
    });
  }
});

// Batch slide creation
app.post('/api/create-slides-batch', async (req, res) => {
  try {
    const { presentationId, slides, accessToken, options = {} } = req.body;
    
    if (!presentationId || !slides || !Array.isArray(slides) || !accessToken) {
      return res.status(400).json({
        error: 'presentationId, slides array, and accessToken are required'
      });
    }

    const client = new SlidesClient(accessToken);
    const batchId = generateUniqueId();
    const results = {
      batchId,
      presentationId,
      totalSlides: slides.length,
      successCount: 0,
      failureCount: 0,
      slides: [],
      errors: [],
      timestamp: new Date().toISOString()
    };

    // Extract layouts once for all slides
    const presentation = await client.getPresentation(presentationId);
    const layouts = LayoutAnalyzer.extractLayouts(presentation);
    
    if (layouts.length === 0) {
      throw new Error('No layouts found in presentation');
    }

    // Process each slide
    for (let i = 0; i < slides.length; i++) {
      try {
        const slideContent = slides[i].content;
        const slideOptions = { ...options, ...slides[i].options };
        
        // Match layout for this slide
        const matchResult = ContentMatcher.findBestLayout(slideContent, layouts);
        const selectedLayout = matchResult.bestLayout;

        // Create slide
        const slideId = generateUniqueId();
        const requests = buildSlideRequests(slideId, selectedLayout, slideContent, slideOptions);

        // Execute batch update for this slide
        const batchResponse = await client.batchUpdate(presentationId, requests);
        
        // Record success
        results.successCount++;
        results.slides.push({
          slideIndex: i + 1,
          slideId,
          slideUrl: client.generateSlideUrl(presentationId, slideId),
          layoutUsed: selectedLayout.displayName,
          elementsCreated: requests.length - 1,
          confidence: calculateConfidence(selectedLayout.score, layouts.length)
        });

      } catch (error) {
        console.error(`Error creating slide ${i + 1}:`, error);
        results.failureCount++;
        results.errors.push({
          slideIndex: i + 1,
          error: error.message
        });
      }
    }

    results.success = results.failureCount === 0;
    results.partialSuccess = results.successCount > 0 && results.failureCount > 0;

    const statusCode = results.success ? 200 : results.partialSuccess ? 207 : 400;
    res.status(statusCode).json(results);

  } catch (error) {
    console.error('Batch creation error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      presentationId: req.body.presentationId,
      timestamp: new Date().toISOString()
    });
  }
});

// Helper Functions

function generateUniqueId() {
  return `id_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function calculateConfidence(score, layoutCount) {
  // Calculate confidence based on score and available options
  const normalizedScore = Math.min(100, Math.max(0, score));
  const optionsPenalty = Math.max(0, (layoutCount - 1) * 2); // More options = lower confidence
  const adjustedScore = Math.max(0, normalizedScore - optionsPenalty);
  
  if (adjustedScore >= 80) return 'very-high';
  if (adjustedScore >= 65) return 'high';
  if (adjustedScore >= 45) return 'medium';
  if (adjustedScore >= 25) return 'low';
  return 'very-low';
}

function generateDetailedExplanation(contentAnalysis, selectedLayout, allLayouts) {
  const explanation = {
    contentFactors: [],
    layoutFactors: [],
    matchingReason: '',
    alternatives: []
  };

  // Content factors
  if (contentAnalysis.hasTitle) explanation.contentFactors.push('Contains title text');
  if (contentAnalysis.hasBody) explanation.contentFactors.push('Contains body text');
  if (contentAnalysis.hasImage) explanation.contentFactors.push('Contains image content');
  if (contentAnalysis.hasBullets) explanation.contentFactors.push('Contains bullet points');
  explanation.contentFactors.push(`Content type: ${contentAnalysis.contentType}`);
  explanation.contentFactors.push(`Content length: ${contentAnalysis.contentLength}`);

  // Layout factors
  const placeholderTypes = selectedLayout.placeholders.map(p => p.type);
  explanation.layoutFactors.push(`Layout: ${selectedLayout.displayName}`);
  explanation.layoutFactors.push(`Placeholders: ${placeholderTypes.join(', ')}`);
  explanation.layoutFactors.push(`Compatibility score: ${selectedLayout.score}/100`);

  // Matching reason
  const reasons = [];
  if (contentAnalysis.hasTitle && placeholderTypes.includes('TITLE')) {
    reasons.push('title content matches title placeholder');
  }
  if (contentAnalysis.hasBody && placeholderTypes.includes('BODY')) {
    reasons.push('body content matches body placeholder');
  }
  if (contentAnalysis.hasImage && placeholderTypes.includes('PICTURE')) {
    reasons.push('image content matches picture placeholder');
  }
  
  explanation.matchingReason = reasons.length > 0 
    ? `Selected because ${reasons.join(' and ')}`
    : 'Selected as best available option based on scoring algorithm';

  // Alternative suggestions
  const sortedLayouts = allLayouts
    .filter(l => l.objectId !== selectedLayout.objectId)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 2);
    
  explanation.alternatives = sortedLayouts.map(layout => ({
    displayName: layout.displayName,
    score: layout.score || 0,
    reason: `Would work ${layout.score > 50 ? 'well' : 'adequately'} for this content`
  }));

  return explanation;
}

function buildSlideRequests(slideId, layout, content, options = {}) {
  const requests = [];
  
  // Create slide request
  const createSlideRequest = {
    createSlide: {
      objectId: slideId,
      slideLayoutReference: {
        layoutId: layout.objectId
      }
    }
  };
  
  // Add insertion index if specified
  if (options.insertIndex !== undefined) {
    createSlideRequest.createSlide.insertionIndex = options.insertIndex;
  }
  
  requests.push(createSlideRequest);

  // Group placeholders by type
  const placeholdersByType = {};
  layout.placeholders.forEach(placeholder => {
    if (!placeholdersByType[placeholder.type]) {
      placeholdersByType[placeholder.type] = [];
    }
    placeholdersByType[placeholder.type].push(placeholder);
  });

  // Insert title
  if (content.title && placeholdersByType.TITLE) {
    requests.push({
      insertText: {
        objectId: placeholdersByType.TITLE[0].objectId,
        text: content.title,
        insertionIndex: 0
      }
    });
  }

  // Insert body content
  if (content.body && placeholdersByType.BODY) {
    let bodyText = content.body;
    
    // Handle bullet points
    if (content.bullets && content.bullets.length > 0) {
      bodyText = content.bullets.map(bullet => `• ${bullet}`).join('\n');
    }
    
    requests.push({
      insertText: {
        objectId: placeholdersByType.BODY[0].objectId,
        text: bodyText,
        insertionIndex: 0
      }
    });
  }

  // Insert subtitle
  if (content.subtitle && placeholdersByType.SUBTITLE) {
    requests.push({
      insertText: {
        objectId: placeholdersByType.SUBTITLE[0].objectId,
        text: content.subtitle,
        insertionIndex: 0
      }
    });
  }

  // Replace image
  if (content.imageUrl && placeholdersByType.PICTURE) {
    requests.push({
      replaceImage: {
        imageObjectId: placeholdersByType.PICTURE[0].objectId,
        url: content.imageUrl,
        imageReplaceMethod: options.imageReplaceMethod || 'CENTER_INSIDE'
      }
    });
  }

  // Handle multiple columns
  if (content.columns && placeholdersByType.CONTENT) {
    content.columns.forEach((columnContent, index) => {
      if (placeholdersByType.CONTENT[index]) {
        requests.push({
          insertText: {
            objectId: placeholdersByType.CONTENT[index].objectId,
            text: columnContent,
            insertionIndex: 0
          }
        });
      }
    });
  }

  return requests;
}

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(port, () => {
  console.log(`Google Slides service running on port ${port}`);
  console.log(`Health check: http://localhost:${port}/health`);
});

module.exports = app;