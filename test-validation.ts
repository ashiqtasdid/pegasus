import { AIPromptTemplates } from './src/ai-prompt-templates.service';

// Test the validation fix
const promptTemplates = new AIPromptTemplates();

// Test with a long prompt (like the enhanced one that failed)
const longPrompt = 'a'.repeat(15000); // 15k characters - should pass now
const result = promptTemplates.validatePromptParameters('TestPlugin', longPrompt);

console.log('Validation result for 15k character prompt:');
console.log('Is valid:', result.isValid);
console.log('Errors:', result.errors);

// Test with an extremely long prompt (should fail)
const tooLongPrompt = 'a'.repeat(50001); // 50k+ characters - should fail
const result2 = promptTemplates.validatePromptParameters('TestPlugin', tooLongPrompt);

console.log('\nValidation result for 50k+ character prompt:');
console.log('Is valid:', result2.isValid);
console.log('Errors:', result2.errors);
