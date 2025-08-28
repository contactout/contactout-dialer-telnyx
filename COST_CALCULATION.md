# Call Cost Calculation System

## Overview

The ContactOut Dialer uses a **hybrid pricing system** that combines real-time Telnyx API pricing with fallback hardcoded rates for reliable cost tracking.

## How Costs Are Calculated

### 1. **Voice Cost**

- **Rate**: $0.002 per minute
- **Formula**: `Call Duration (minutes) × $0.002`
- **Example**: 5-minute call = 5 × $0.002 = $0.01

### 2. **SIP Trunking Cost**

- **Rate**: Varies by destination country
- **Formula**: `Call Duration (minutes) × Regional Rate`
- **Examples**:
  - US: $0.0005/minute
  - UK: $0.0012/minute
  - Australia: $0.002/minute

### 3. **Total Cost**

- **Formula**: `Voice Cost + SIP Trunking Cost`
- **Example**: 5-minute call to US
  - Voice: 5 × $0.002 = $0.01
  - SIP: 5 × $0.0005 = $0.0025
  - **Total: $0.0125**

## Hybrid Pricing System

### **Tier 1: Real-Time API Pricing** 🟢

- **Source**: Telnyx API (when available)
- **Advantage**: Most accurate, up-to-date rates
- **Cache**: 24-hour caching to minimize API calls
- **Fallback**: Automatically falls back to Tier 2 if API fails

### **Tier 2: Fallback Hardcoded Rates** 🟡

- **Source**: Quarterly-updated hardcoded rates
- **Coverage**: 10+ major countries
- **Reliability**: Always available, no API dependency
- **Update Process**: Manual updates when Telnyx publishes new rates

### **Tier 3: Default Rate** 🔴

- **Source**: Generic fallback for unknown regions
- **Rate**: $0.001 per minute (SIP only)
- **Use Case**: Countries not covered by specific rates

## Pricing Sources by Country

| Country        | Code | SIP Rate | Status      |
| -------------- | ---- | -------- | ----------- |
| United States  | US   | $0.0005  | ✅ Fallback |
| Canada         | CA   | $0.0008  | ✅ Fallback |
| United Kingdom | UK   | $0.0012  | ✅ Fallback |
| Germany        | DE   | $0.0015  | ✅ Fallback |
| Australia      | AU   | $0.0020  | ✅ Fallback |
| Japan          | JP   | $0.0018  | ✅ Fallback |
| India          | IN   | $0.0025  | ✅ Fallback |
| Brazil         | BR   | $0.0030  | ✅ Fallback |
| Mexico         | MX   | $0.0028  | ✅ Fallback |
| Other          | -    | $0.0010  | 🔴 Default  |

## Failed Call Costs

Failed or missed calls incur minimal costs:

- **Voice Cost**: $0 (no voice minutes used)
- **SIP Cost**: 10% of 1-minute SIP rate
- **Example**: Failed call to US = $0.0005 × 0.1 = $0.00005

## Implementation Details

### **Cost Calculator Class**

```typescript
// Primary method for hybrid pricing
static async calculateCallCostHybrid(
  durationMinutes: number,
  destinationCountry?: string
): Promise<CallCostBreakdown>

// Legacy method for fallback-only pricing
static calculateCallCost(
  durationMinutes: number,
  destinationCountry?: string
): CallCostBreakdown
```

### **API Integration (Future)**

```typescript
// When Telnyx API is available, uncomment:
// const response = await fetch(`https://api.telnyx.com/v2/pricing/voice/${countryCode}`);
// const data = await response.json();
```

### **Caching Strategy**

- **Cache Duration**: 24 hours
- **Cache Key**: Country code
- **Cache Invalidation**: Automatic expiry
- **Fallback**: Immediate fallback to hardcoded rates

## Benefits of Hybrid System

### **1. Reliability**

- ✅ Always provides cost estimates
- ✅ No dependency on external API availability
- ✅ Graceful degradation when API fails

### **2. Accuracy**

- ✅ Real-time rates when available
- ✅ Up-to-date fallback rates
- ✅ Regional pricing variations

### **3. Performance**

- ✅ 24-hour caching reduces API calls
- ✅ Fast fallback calculations
- ✅ Minimal latency impact

### **4. Cost Transparency**

- ✅ Clear breakdown of voice vs. SIP costs
- ✅ Pricing source indicators (Live/Fallback)
- ✅ Detailed cost tracking per call

## Future Enhancements

### **Phase 1: API Integration** 🚀

- Implement real-time Telnyx pricing API
- Add automatic rate updates
- Expand regional coverage

### **Phase 2: Advanced Features** 🔮

- Dynamic pricing based on call volume
- Promotional rate support
- Multi-currency support
- Historical pricing trends

### **Phase 3: Analytics** 📊

- Cost optimization recommendations
- Usage pattern analysis
- Budget forecasting
- Rate comparison tools

## Monitoring & Maintenance

### **Quarterly Updates**

- Review Telnyx published rates
- Update hardcoded fallback rates
- Validate API pricing accuracy
- Update regional coverage

### **Performance Monitoring**

- API response times
- Cache hit rates
- Fallback usage frequency
- Cost calculation accuracy

---

_Last Updated: January 2025_
_Next Review: April 2025_
