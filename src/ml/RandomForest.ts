/**
 * Simulated Random Forest Classifier
 * This class implements a multi-tree decision engine that predicts bug severity
 * based on weighted feature analysis and statistical variance.
 */
export class RandomForestClassifier {
  numTrees: number;
  featureWeights: Record<string, number>;

  constructor(numTrees = 10) {
    this.numTrees = numTrees;
    this.featureWeights = {
      bug_type: 1.5,
      affected_users: 2.0,
      frequency_per_day: 1.2,
      component_criticality: 1.8,
      time_to_reproduce: 1.0,
      stack_trace_depth: 0.8,
      environment: 1.4,
      days_since_reported: 0.5,
      has_workaround: 1.1,
      error_rate_spike: 1.6
    };
  }

  // Encoding helpers
  private encodeBugType(type: string) {
    const map: Record<string, number> = { crash: 5, memory_leak: 4, security: 5, performance: 3, ui: 2, logic: 3, network: 4 };
    return map[type] || 3;
  }

  private encodeComponent(comp: string) {
    const map: Record<string, number> = { core: 5, auth: 5, payment: 4, api: 3, frontend: 2, database: 5 };
    return map[comp] || 3;
  }

  private encodeEnvironment(env: string) {
    const map: Record<string, number> = { production: 5, staging: 2, development: 1 };
    return map[env] || 1;
  }

  private encodeTimeToReproduce(time: string) {
    const map: Record<string, number> = { immediate: 5, sometimes: 3, rare: 1 };
    return map[time] || 3;
  }

  private encodeWorkaround(wa: string) {
    const map: Record<string, number> = { no: 3, partial: 2, yes: 1 };
    return map[wa] || 2;
  }

  private encodeErrorSpike(spike: string) {
    const map: Record<string, number> = { ">50%": 5, "20-50%": 4, "5-20%": 3, "<5%": 2 };
    return map[spike] || 2;
  }

  predict(features: any) {
    const treePredictions: number[] = [];
    
    // Feature normalization and encoding
    const inputs: Record<string, number> = {
      bug_type: this.encodeBugType(features.type),
      affected_users: Math.min(features.affectedUsers / 10000, 1) * 5,
      frequency_per_day: Math.min(features.frequency / 100, 1) * 5,
      component_criticality: this.encodeComponent(features.component),
      time_to_reproduce: this.encodeTimeToReproduce(features.timeToReproduce),
      stack_trace_depth: Math.min(features.stackDepth / 50, 1) * 5,
      environment: this.encodeEnvironment(features.environment),
      days_since_reported: Math.min((features.daysSince || 0) / 30, 1) * 5,
      has_workaround: this.encodeWorkaround(features.workaround),
      error_rate_spike: this.encodeErrorSpike(features.errorRateSpike)
    };

    // Simulate 10 decision trees with noise
    for (let i = 0; i < this.numTrees; i++) {
      let score = 0;
      let totalWeight = 0;

      for (const [feature, weight] of Object.entries(this.featureWeights)) {
        // Add ±15% noise to weights per tree
        const noise = 1 + (Math.random() * 0.3 - 0.15);
        const adjustedWeight = weight * noise;
        score += inputs[feature] * adjustedWeight;
        totalWeight += adjustedWeight;
      }

      // Normalize to 1-10 range with adjusted sensitivity
      const treeScore = Math.min(Math.max((score / (totalWeight * 4.2)) * 10, 1), 10);
      treePredictions.push(treeScore);
    }

    const finalScore = treePredictions.reduce((a, b) => a + b, 0) / this.numTrees;
    
    // Calculate confidence based on variance
    const mean = finalScore;
    const variance = treePredictions.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / this.numTrees;
    const stdDev = Math.sqrt(variance);
    // Confidence: 100% - (stdDev scaled to percentage)
    const confidence = Math.max(Math.min(100 - (stdDev * 12), 98), 55);

    let label = "LOW";
    if (finalScore >= 7.5) label = "CRITICAL";
    else if (finalScore >= 5.5) label = "HIGH";
    else if (finalScore >= 3.5) label = "MEDIUM";

    // Feature importance (simulated based on weights + input values)
    const importance = Object.keys(this.featureWeights).map(key => ({
      feature: key.replace(/_/g, ' '),
      value: (inputs[key] * this.featureWeights[key]) / 25 // Rough normalization
    })).sort((a, b) => b.value - a.value);

    return {
      score: parseFloat(finalScore.toFixed(1)),
      label,
      confidence: Math.round(confidence),
      treePredictions: treePredictions.map(s => parseFloat(s.toFixed(1))),
      importance
    };
  }
}
