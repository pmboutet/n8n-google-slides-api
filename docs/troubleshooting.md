# Troubleshooting Guide

Common issues and solutions for the Google Slides n8n automation system.

## Authentication Issues

### Error: "Authentication failed"

**Symptoms:**
- 401 Unauthorized responses
- "Invalid credentials" messages
- OAuth2 flow failures

**Solutions:**

1. **Check OAuth2 Credentials**
   ```bash
   # Verify in n8n credentials settings
   # Ensure Client ID and Secret are correct
   # Verify authorized redirect URIs include your n8n domain
   ```

2. **Refresh Access Token**
   - In n8n, edit your Google OAuth2 credential
   - Click "Reconnect" to refresh the token
   - Complete the authorization flow again

3. **Verify Scopes**
   Required scopes:
   ```
   https://www.googleapis.com/auth/presentations
   https://www.googleapis.com/auth/drive
   ```

4. **Check API Enablement**
   ```bash
   gcloud services list --enabled
   # Should include slides.googleapis.com
   ```

### Error: "Permission denied"

**Symptoms:**
- 403 Forbidden responses
- "Insufficient permissions" messages

**Solutions:**

1. **Verify Presentation Access**
   - Ensure the Google account has edit access to the presentation
   - Check if presentation is shared with the service account

2. **Check Presentation ID**
   ```javascript
   // Extract ID from URL:
   // https://docs.google.com/presentation/d/PRESENTATION_ID/edit
   const presentationId = "1a2B3cDEfgHIjkLmnopQRsTuVWxyz";
   ```

## API Quota Issues

### Error: "Quota exceeded"

**Symptoms:**
- 429 Too Many Requests responses
- Rate limit exceeded messages

**Solutions:**

1. **Implement Exponential Backoff**
   ```javascript
   async function makeRequestWithRetry(url, options, maxRetries = 3) {
     for (let i = 0; i < maxRetries; i++) {
       try {
         return await $request({ url, ...options });
       } catch (error) {
         if (error.statusCode === 429 && i < maxRetries - 1) {
           const delay = Math.pow(2, i) * 1000; // Exponential backoff
           await new Promise(resolve => setTimeout(resolve, delay));
           continue;
         }
         throw error;
       }
     }
   }
   ```

2. **Monitor Quota Usage**
   - Check Google Cloud Console > APIs & Services > Quotas
   - Set up quota alerts

3. **Optimize Batch Requests**
   ```javascript
   // Group multiple operations into single batch
   const requests = [
     { createSlide: { ... } },
     { insertText: { ... } },
     { insertText: { ... } }
   ];
   ```

## Layout Detection Issues

### Error: "No layouts found"

**Symptoms:**
- Empty layouts array
- "No layouts available" messages

**Solutions:**

1. **Check Presentation Structure**
   ```javascript
   // Debug layout extraction
   console.log('Presentation layouts:', presentation.layouts);
   console.log('Masters:', presentation.masters);
   ```

2. **Verify Master Slides**
   - Ensure presentation has master slides
   - Check that masters contain layouts
   - Verify layouts have placeholders

3. **Manual Layout Inspection**
   ```javascript
   // Add to your Function node for debugging
   if (presentation.layouts) {
     presentation.layouts.forEach((layout, index) => {
       console.log(`Layout ${index}:`, {
         objectId: layout.objectId,
         displayName: layout.layoutProperties?.displayName,
         elementCount: layout.pageElements?.length || 0
       });
     });
   }
   ```

### Error: "Layout matching failed"

**Symptoms:**
- Poor layout selection
- Unexpected layout choices
- Low confidence scores

**Solutions:**

1. **Adjust Scoring Algorithm**
   ```javascript
   // Customize scoring weights in ContentMatcher
   const CUSTOM_WEIGHTS = {
     titleMatch: 30,    // Increase title importance
     bodyMatch: 25,     // Increase body importance
     imageMatch: 20,    // Adjust image importance
     contentTypeBonus: 15
   };
   ```

2. **Add Debug Information**
   ```javascript
   // In match-layout.js, add detailed logging
   layouts.forEach(layout => {
     const score = this.calculateLayoutScore(contentAnalysis, layout);
     console.log(`Layout "${layout.displayName}" scored ${score}`);
   });
   ```

3. **Custom Content Type Detection**
   ```javascript
   // Add custom content type rules
   static determineContentType(content, analysis) {
     const title = (content.title || '').toLowerCase();
     const body = (content.body || '').toLowerCase();
     
     // Add your custom rules here
     if (title.includes('your-keyword')) return 'custom-type';
     
     // ... existing logic
   }
   ```

## Slide Creation Issues

### Error: "Batch update failed"

**Symptoms:**
- Slide creation fails
- Partial content insertion
- Invalid request format errors

**Solutions:**

1. **Validate Request Structure**
   ```javascript
   // Ensure proper request format
   const request = {
     createSlide: {
       objectId: generateId(), // Must be unique
       slideLayoutReference: {
         layoutId: layout.objectId // Must exist
       }
     }
   };
   ```

2. **Check Object IDs**
   ```javascript
   // Verify placeholder object IDs exist
   const placeholders = layout.placeholders || [];
   placeholders.forEach(p => {
     if (!p.objectId) {
       console.error('Missing objectId for placeholder:', p);
     }
   });
   ```

3. **Debug Batch Requests**
   ```javascript
   // Log requests before sending
   console.log('Batch requests:', JSON.stringify(requests, null, 2));
   
   try {
     const response = await makeRequest(url, 'POST', { requests });
     console.log('Batch response:', response);
   } catch (error) {
     console.error('Batch error:', error.response?.body || error.message);
   }
   ```

### Error: "Image insertion failed"

**Symptoms:**
- Images not appearing
- "Invalid image URL" errors
- Image placeholder not replaced

**Solutions:**

1. **Verify Image URL Accessibility**
   ```javascript
   // Test image URL before using
   async function validateImageUrl(url) {
     try {
       const response = await $request({ method: 'HEAD', url });
       return response.headers['content-type']?.startsWith('image/');
     } catch (error) {
       return false;
     }
   }
   ```

2. **Check Image Format Support**
   - Supported formats: JPEG, PNG, GIF, BMP
   - Maximum size: 50MB
   - URL must be publicly accessible

3. **Use Proper Replace Image Request**
   ```javascript
   {
     replaceImage: {
       imageObjectId: placeholderObjectId,
       url: imageUrl,
       imageReplaceMethod: "CENTER_INSIDE"
     }
   }
   ```

## Content Formatting Issues

### Error: "Text formatting failed"

**Symptoms:**
- Text appears without formatting
- Font size/color not applied
- Formatting partially applied

**Solutions:**

1. **Verify Color Format**
   ```javascript
   // Convert hex to RGB for Google Slides API
   function hexToRgb(hex) {
     const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
     return result ? {
       red: parseInt(result[1], 16) / 255,
       green: parseInt(result[2], 16) / 255,
       blue: parseInt(result[3], 16) / 255
     } : null;
   }
   ```

2. **Use Correct Field Specification**
   ```javascript
   {
     updateTextStyle: {
       objectId: textObjectId,
       style: { /* styling */ },
       fields: "fontSize,foregroundColor,bold,italic" // Specify changed fields
     }
   }
   ```

3. **Apply Formatting After Text Insertion**
   ```javascript
   const requests = [
     { insertText: { /* text content */ } },
     { updateTextStyle: { /* formatting */ } } // Apply after insertion
   ];
   ```

## n8n-Specific Issues

### Error: "Credential not found"

**Symptoms:**
- "googleOAuth2Api credential not found"
- Credential access errors in Function nodes

**Solutions:**

1. **Verify Credential Configuration**
   ```javascript
   // In Function node, check credential access
   try {
     const credentials = await this.getCredentials('googleOAuth2Api');
     console.log('Credentials loaded:', !!credentials.access_token);
   } catch (error) {
     console.error('Credential error:', error.message);
   }
   ```

2. **Set Correct Credential Type**
   - Use "Google OAuth2 API" not "Google"
   - Ensure credential is saved and connected

### Error: "$request is not defined"

**Symptoms:**
- Function execution fails
- Missing $request helper in Function nodes

**Solutions:**

1. **Use Correct n8n Helpers**
   ```javascript
   // In Function nodes, use $request helper
   const response = await $request({
     method: 'GET',
     url: 'https://slides.googleapis.com/v1/presentations/id',
     headers: { /* headers */ },
     json: true
   });
   ```

2. **Alternative: Use HTTP Request Node**
   - Replace Function node API calls with HTTP Request nodes
   - Set authentication to Google OAuth2 credential

## Performance Issues

### Slow Slide Creation

**Symptoms:**
- Long response times
- Timeouts in n8n workflows

**Solutions:**

1. **Optimize Layout Extraction**
   ```javascript
   // Cache layouts for reuse
   const layoutCache = new Map();
   
   function getCachedLayouts(presentationId) {
     if (layoutCache.has(presentationId)) {
       return layoutCache.get(presentationId);
     }
     // Extract and cache layouts
   }
   ```

2. **Use Minimal API Calls**
   ```javascript
   // Combine operations in single batch request
   const allRequests = [
     ...slideCreationRequests,
     ...contentInsertionRequests,
     ...formattingRequests
   ];
   ```

3. **Set Appropriate Timeouts**
   ```javascript
   // In HTTP Request nodes or $request
   const options = {
     timeout: 30000, // 30 seconds
     // ... other options
   };
   ```

## Debugging Tips

### Enable Detailed Logging

```javascript
// Add to your Function nodes
const DEBUG = true;

function log(message, data = null) {
  if (DEBUG) {
    console.log(`[DEBUG] ${message}`, data ? JSON.stringify(data, null, 2) : '');
  }
}

// Use throughout your code
log('Starting slide creation', { deckId, contentType: content.type });
log('Layout selected', { layoutId: selectedLayout.objectId, score: selectedLayout.score });
log('Batch requests prepared', requests);
```

### Test Individual Components

```javascript
// Test layout extraction only
const presentation = await client.getPresentation(deckId);
const layouts = LayoutAnalyzer.extractLayouts(presentation);
console.log('Extracted layouts:', layouts.length);

// Test content analysis only
const analysis = ContentMatcher.analyzeContent(content);
console.log('Content analysis:', analysis);

// Test layout matching only
const match = ContentMatcher.findBestLayout(content, layouts);
console.log('Best match:', match.bestLayout.displayName, 'Score:', match.bestLayout.score);
```

### Validate Data at Each Step

```javascript
// Add validation functions
function validatePresentationId(id) {
  if (!id || typeof id !== 'string' || id.length < 10) {
    throw new Error('Invalid presentation ID format');
  }
}

function validateContent(content) {
  if (!content || (!content.title && !content.body)) {
    throw new Error('Content must have at least title or body');
  }
}

function validateLayout(layout) {
  if (!layout || !layout.objectId) {
    throw new Error('Invalid layout object');
  }
}
```

## Getting Help

1. **Check n8n Community Forum**: Search for similar issues
2. **Google Slides API Documentation**: Refer to official docs for API details
3. **Enable Debug Mode**: Use detailed logging to trace issues
4. **Test with Simple Cases**: Start with basic slide creation before adding complexity
5. **Review Examples**: Compare your implementation with provided examples

## Common Error Messages Reference

| Error Message | Cause | Solution |
|---------------|-------|----------|
| "Invalid presentation ID" | Wrong or malformed ID | Extract correct ID from Google Slides URL |
| "Layout not found" | Layout ID doesn't exist | Re-extract layouts or check layout structure |
| "Placeholder not found" | Placeholder ID invalid | Verify placeholder exists in selected layout |
| "Image URL not accessible" | Image URL blocked/invalid | Use publicly accessible image URLs |
| "Request too large" | Batch request exceeds limits | Split into smaller batch requests |
| "Invalid field mask" | Wrong field specification | Use correct field names for updates |
| "Duplicate object ID" | Object ID already exists | Generate unique IDs for new objects |

For additional support, check the repository's issues section or create a new issue with detailed error information and steps to reproduce.