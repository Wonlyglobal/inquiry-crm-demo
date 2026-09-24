// Presentation only; never interpret model output as HTML.
export function plainAnswer(value){return String(value??'').replace(/\\\*/g,'').replace(/\*/g,'').replace(/^#{1,6}\s+/gm,'').trim()}
