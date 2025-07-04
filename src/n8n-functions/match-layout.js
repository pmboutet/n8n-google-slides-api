/**
 * n8n Function Node: Match Content to Best Layout
 * 
 * This function analyzes content and selects the most appropriate
 * layout from available options.
 * 
 * Expected input: $json with 'content' and 'layouts' properties
 */

// Get input data
const content = $json.content;
const layouts = $json.layouts || $json.categorizedLayouts;

if (!content) {
  throw new Error('content is required in input data');
}
if (!layouts) {
  throw new Error('layouts data is required in input data');
}

// ContentMatcher class (inline for n8n)
class ContentMatcher {
  static findBestLayout(content, layouts) {
    // Flatten categorized layouts if needed
    let layoutArray = layouts;
    if (typeof layouts === 'object' && !Array.isArray(layouts)) {
      layoutArray = [];
      Object.values(layouts).forEach(categoryLayouts => {
        if (Array.isArray(categoryLayouts)) {
          layoutArray = layoutArray.concat(categoryLayouts);
        }
      });
    }
    
    if (!layoutArray || layoutArray.length === 0) {
      throw new Error('No layouts available');
    }

    const contentAnalysis = this.analyzeContent(content);
    const scoredLayouts = layoutArray.map(layout => ({
      ...layout,
      score: this.calculateLayoutScore(contentAnalysis, layout)
    }));

    scoredLayouts.sort((a, b) => b.score - a.score);
    
    return {
      bestLayout: scoredLayouts[0],
      alternatives: scoredLayouts.slice(1, 3),
      contentAnalysis,
      reasoning: this.generateReasoning(contentAnalysis, scoredLayouts[0])
    };
  }

  static analyzeContent(content) {
    const analysis = {
      hasTitle: Boolean(content.title && content.title.trim()),
      hasBody: Boolean(content.body && content.body.trim()),
      hasImage: Boolean(content.imageUrl || content.images?.length),
      hasBullets: Boolean(content.bullets?.length || content.bulletPoints?.length),
      hasMultipleColumns: Boolean(content.columns?.length > 1),
      contentLength: 'short',
      contentType: 'general',
      imageCount: 0,
      bulletCount: 0
    };

    const bodyText = content.body || '';
    if (bodyText.length > 500) {
      analysis.contentLength = 'long';
    } else if (bodyText.length > 150) {
      analysis.contentLength = 'medium';
    }

    if (content.imageUrl) analysis.imageCount = 1;
    if (content.images) analysis.imageCount = content.images.length;
    if (content.bullets) analysis.bulletCount = content.bullets.length;
    if (content.bulletPoints) analysis.bulletCount = content.bulletPoints.length;

    analysis.contentType = this.determineContentType(content, analysis);
    return analysis;
  }

  static determineContentType(content, analysis) {
    const title = (content.title || '').toLowerCase();
    const body = (content.body || '').toLowerCase();
    
    if (title.includes('agenda') || body.includes('agenda')) return 'agenda';
    if (title.includes('quote') || body.match(/["'']/)) return 'quote';
    if (title.includes('section') || title.includes('chapter')) return 'section';
    if (analysis.hasImage && !analysis.hasBody) return 'image-focused';
    if (analysis.hasBullets && analysis.bulletCount > 5) return 'list-heavy';
    if (content.comparison || title.includes('vs') || title.includes('versus')) return 'comparison';
    if (title.includes('thank') || title.includes('conclusion')) return 'closing';
    
    return 'general';
  }

  static calculateLayoutScore(contentAnalysis, layout) {
    let score = 0;
    const placeholderTypes = layout.placeholders.map(p => p.type);
    const category = this.getLayoutCategory(layout);

    const categoryScores = this.getCategoryScores(contentAnalysis, category);
    score += categoryScores;

    if (contentAnalysis.hasTitle && placeholderTypes.includes('TITLE')) {
      score += 20;
    }
    if (contentAnalysis.hasBody && placeholderTypes.includes('BODY')) {
      score += 15;
    }
    if (contentAnalysis.hasImage && placeholderTypes.includes('PICTURE')) {
      score += 10;
    }

    if (!contentAnalysis.hasTitle && placeholderTypes.includes('TITLE')) {
      score -= 5;
    }
    if (!contentAnalysis.hasBody && placeholderTypes.includes('BODY')) {
      score -= 5;
    }

    if (contentAnalysis.contentLength === 'long' && category === 'titleOnly') {
      score -= 15;
    }
    if (contentAnalysis.contentLength === 'short' && category === 'titleAndTwoColumns') {
      score -= 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  static getCategoryScores(contentAnalysis, category) {
    const { contentType } = contentAnalysis;

    const scoreMatrix = {
      'section': {
        'sectionHeader': 40, 'titleOnly': 30, 'titleAndBody': 20
      },
      'quote': {
        'sectionHeader': 35, 'titleOnly': 30, 'titleAndBody': 25
      },
      'image-focused': {
        'blank': 40, 'titleOnly': 35, 'titleAndBody': 20
      },
      'comparison': {
        'titleAndTwoColumns': 40, 'titleAndBody': 25, 'blank': 20
      },
      'list-heavy': {
        'titleAndBody': 35, 'titleAndTwoColumns': 30, 'blank': 20
      },
      'general': {
        'titleAndBody': 35, 'titleOnly': 25, 'sectionHeader': 20,
        'titleAndTwoColumns': 15, 'blank': 10
      }
    };

    return scoreMatrix[contentType]?.[category] || scoreMatrix['general'][category] || 0;
  }

  static getLayoutCategory(layout) {
    const placeholderTypes = layout.placeholders.map(p => p.type);
    const displayName = layout.displayName?.toUpperCase() || '';
    
    if (displayName.includes('TITLE_ONLY')) return 'titleOnly';
    if (displayName.includes('SECTION_HEADER')) return 'sectionHeader';
    if (displayName.includes('TWO_COLUMNS')) return 'titleAndTwoColumns';
    if (displayName.includes('BLANK')) return 'blank';

    const hasTitle = placeholderTypes.includes('TITLE');
    const hasBody = placeholderTypes.includes('BODY');
    const bodyCount = placeholderTypes.filter(t => t === 'BODY' || t === 'CONTENT').length;

    if (hasTitle && !hasBody) return 'titleOnly';
    if (hasTitle && hasBody && bodyCount === 1) return 'titleAndBody';
    if (hasTitle && bodyCount >= 2) return 'titleAndTwoColumns';
    if (placeholderTypes.includes('SUBTITLE')) return 'sectionHeader';
    if (placeholderTypes.length === 0) return 'blank';

    return 'other';
  }

  static generateReasoning(contentAnalysis, selectedLayout) {
    const reasons = [];
    const category = this.getLayoutCategory(selectedLayout);
    
    if (contentAnalysis.contentType !== 'general') {
      reasons.push(`Content type '${contentAnalysis.contentType}' best matches ${category} layout`);
    }
    
    if (contentAnalysis.hasTitle && selectedLayout.placeholders.some(p => p.type === 'TITLE')) {
      reasons.push('Layout has title placeholder for provided title');
    }
    
    if (contentAnalysis.hasBody && selectedLayout.placeholders.some(p => p.type === 'BODY')) {
      reasons.push('Layout has body placeholder for provided content');
    }
    
    if (contentAnalysis.hasImage) {
      reasons.push('Layout can accommodate image content');
    }
    
    reasons.push(`Score: ${selectedLayout.score}/100`);
    
    return reasons.join('; ');
  }
}

// Main execution
try {
  const result = ContentMatcher.findBestLayout(content, layouts);
  
  return {
    success: true,
    selectedLayout: result.bestLayout,
    alternatives: result.alternatives,
    contentAnalysis: result.contentAnalysis,
    reasoning: result.reasoning,
    confidence: result.bestLayout.score > 70 ? 'high' : 
                result.bestLayout.score > 40 ? 'medium' : 'low',
    timestamp: new Date().toISOString()
  };
  
} catch (error) {
  return {
    success: false,
    error: error.message,
    timestamp: new Date().toISOString()
  };
}