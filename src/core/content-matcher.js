/**
 * Content Matcher for Google Slides
 * Intelligently matches content with appropriate slide layouts
 */

class ContentMatcher {
  /**
   * Find the best layout for given content
   * @param {Object} content - Content object with title, body, images, etc.
   * @param {Array} layouts - Available layouts from LayoutAnalyzer
   * @returns {Object} Best matching layout with score
   */
  static findBestLayout(content, layouts) {
    if (!layouts || layouts.length === 0) {
      throw new Error('No layouts available');
    }

    const contentAnalysis = this.analyzeContent(content);
    const scoredLayouts = layouts.map(layout => ({
      ...layout,
      score: this.calculateLayoutScore(contentAnalysis, layout)
    }));

    // Sort by score (highest first)
    scoredLayouts.sort((a, b) => b.score - a.score);
    
    return {
      bestLayout: scoredLayouts[0],
      alternatives: scoredLayouts.slice(1, 3), // Top 2 alternatives
      contentAnalysis,
      reasoning: this.generateReasoning(contentAnalysis, scoredLayouts[0])
    };
  }

  /**
   * Analyze content to determine its characteristics
   * @param {Object} content - Content object
   * @returns {Object} Content analysis
   */
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

    // Analyze content length
    const bodyText = content.body || '';
    if (bodyText.length > 500) {
      analysis.contentLength = 'long';
    } else if (bodyText.length > 150) {
      analysis.contentLength = 'medium';
    }

    // Count images
    if (content.imageUrl) analysis.imageCount = 1;
    if (content.images) analysis.imageCount = content.images.length;

    // Count bullets
    if (content.bullets) analysis.bulletCount = content.bullets.length;
    if (content.bulletPoints) analysis.bulletCount = content.bulletPoints.length;

    // Determine content type
    analysis.contentType = this.determineContentType(content, analysis);

    return analysis;
  }

  /**
   * Determine the type of content
   * @param {Object} content - Original content
   * @param {Object} analysis - Content analysis
   * @returns {string} Content type
   */
  static determineContentType(content, analysis) {
    const title = (content.title || '').toLowerCase();
    const body = (content.body || '').toLowerCase();
    
    // Check for specific content types
    if (title.includes('agenda') || body.includes('agenda')) return 'agenda';
    if (title.includes('quote') || body.match(/["'']/)) return 'quote';
    if (title.includes('section') || title.includes('chapter')) return 'section';
    if (analysis.hasImage && !analysis.hasBody) return 'image-focused';
    if (analysis.hasBullets && analysis.bulletCount > 5) return 'list-heavy';
    if (content.comparison || title.includes('vs') || title.includes('versus')) return 'comparison';
    if (title.includes('thank') || title.includes('conclusion')) return 'closing';
    
    return 'general';
  }

  /**
   * Calculate layout score based on content analysis
   * @param {Object} contentAnalysis - Analysis of the content
   * @param {Object} layout - Layout object
   * @returns {number} Score (0-100)
   */
  static calculateLayoutScore(contentAnalysis, layout) {
    let score = 0;
    const placeholderTypes = layout.placeholders.map(p => p.type);
    const category = this.getLayoutCategory(layout);

    // Base scoring by layout category and content type
    const categoryScores = this.getCategoryScores(contentAnalysis, category);
    score += categoryScores;

    // Bonus points for placeholder alignment
    if (contentAnalysis.hasTitle && placeholderTypes.includes('TITLE')) {
      score += 20;
    }
    if (contentAnalysis.hasBody && placeholderTypes.includes('BODY')) {
      score += 15;
    }
    if (contentAnalysis.hasImage && placeholderTypes.includes('PICTURE')) {
      score += 10;
    }

    // Penalties for mismatches
    if (!contentAnalysis.hasTitle && placeholderTypes.includes('TITLE')) {
      score -= 5;
    }
    if (!contentAnalysis.hasBody && placeholderTypes.includes('BODY')) {
      score -= 5;
    }

    // Content length considerations
    if (contentAnalysis.contentLength === 'long' && category === 'titleOnly') {
      score -= 15;
    }
    if (contentAnalysis.contentLength === 'short' && category === 'titleAndTwoColumns') {
      score -= 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Get base scores for layout categories
   * @param {Object} contentAnalysis - Content analysis
   * @param {string} category - Layout category
   * @returns {number} Base score
   */
  static getCategoryScores(contentAnalysis, category) {
    const { contentType, hasTitle, hasBody, hasImage, hasBullets } = contentAnalysis;

    const scoreMatrix = {
      'section': {
        'sectionHeader': 40,
        'titleOnly': 30,
        'titleAndBody': 20
      },
      'quote': {
        'sectionHeader': 35,
        'titleOnly': 30,
        'titleAndBody': 25
      },
      'image-focused': {
        'blank': 40,
        'titleOnly': 35,
        'titleAndBody': 20
      },
      'comparison': {
        'titleAndTwoColumns': 40,
        'titleAndBody': 25,
        'blank': 20
      },
      'list-heavy': {
        'titleAndBody': 35,
        'titleAndTwoColumns': 30,
        'blank': 20
      },
      'general': {
        'titleAndBody': 35,
        'titleOnly': 25,
        'sectionHeader': 20,
        'titleAndTwoColumns': 15,
        'blank': 10
      }
    };

    return scoreMatrix[contentType]?.[category] || scoreMatrix['general'][category] || 0;
  }

  /**
   * Get layout category from layout object
   * @param {Object} layout - Layout object
   * @returns {string} Category name
   */
  static getLayoutCategory(layout) {
    const placeholderTypes = layout.placeholders.map(p => p.type);
    const displayName = layout.displayName?.toUpperCase() || '';
    
    if (displayName.includes('TITLE_ONLY') || displayName.includes('TITLE ONLY')) return 'titleOnly';
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

  /**
   * Generate reasoning for layout selection
   * @param {Object} contentAnalysis - Content analysis
   * @param {Object} selectedLayout - Selected layout
   * @returns {string} Human-readable reasoning
   */
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

// Export for n8n usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ContentMatcher;
} else {
  // For n8n Function node
  this.ContentMatcher = ContentMatcher;
}