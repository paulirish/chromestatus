export const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'arent', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'cant', 'cannot', 'could', 'couldnt',
  'did', 'didnt', 'do', 'does', 'doesnt', 'doing', 'dont', 'down', 'during',
  'each', 'early',
  'few', 'for', 'from', 'further',
  'had', 'hadnt', 'has', 'hasnt', 'have', 'havent', 'having', 'he', 'hed', 'hell', 'hes', 'her', 'here', 'heres', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'hows',
  'i', 'id', 'ill', 'im', 'ive', 'if', 'in', 'into', 'is', 'isnt', 'it', 'its', 'itself',
  'lets',
  'me', 'more', 'most', 'mustnt', 'my', 'myself',
  'no', 'nor', 'not',
  'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
  'same', 'shant', 'she', 'shed', 'shell', 'shes', 'should', 'shouldnt', 'so', 'some', 'such',
  'than', 'that', 'thats', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'theres', 'these', 'they', 'theyd', 'theyll', 'theyre', 'theyve', 'this', 'those', 'through', 'to', 'too',
  'under', 'until', 'up',
  'very',
  'was', 'wasnt', 'we', 'wed', 'well', 'were', 'weve', 'werent', 'what', 'whats', 'when', 'whens', 'where', 'wheres', 'which', 'while', 'who', 'whos', 'whom', 'why', 'whys', 'with', 'wont', 'would', 'wouldnt',
  'you', 'youd', 'youll', 'youre', 'youve', 'your', 'yours', 'yourself', 'yourselves',
  // Domain-specific capability boilerplate
  'allow', 'allows', 'api', 'feature', 'support', 'web', 'browser', 'browsers', 'chrome', 'enabled', 'default', 'users', 'developer', 'developers', 'page', 'pages', 'method', 'interface', 'element', 'elements', 'attribute', 'attributes', 'property', 'properties', 'object', 'objects', 'function', 'functions', 'adds', 'added', 'add', 'remove', 'removed', 'removes', 'use', 'using', 'used', 'provide', 'provides', 'provided', 'new', 'can', 'will', 'via', 'also', 'now', 'data', 'value', 'values', 'return', 'returns', 'access', 'accessible', 'current', 'currently', 'make', 'makes', 'available', 'defined', 'define', 'defines', 'spec', 'specification', 'standard', 'standards', 'implement', 'implemented', 'implementation', 'let', 'lets', 'set', 'sets', 'change', 'changes', 'changed', 'enable', 'enables', 'control', 'controls', 'target', 'targets', 'type', 'types', 'event', 'events', 'behavior', 'behaviors', 'create', 'creates', 'created'
]);

export function tokenize(text: string): Set<string> {
  const tokens = new Set<string>();
  const matches = text.toLowerCase().match(/\b[a-z0-9]+\b/g);
  if (!matches) return tokens;
  for (const word of matches) {
    if (!STOP_WORDS.has(word) && word.length > 1) {
      tokens.add(word);
    }
  }
  return tokens;
}

export function jaccardIndex(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  return intersection / (setA.size + setB.size - intersection);
}

export function overlapCoefficient(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  return intersection / Math.min(setA.size, setB.size);
}
