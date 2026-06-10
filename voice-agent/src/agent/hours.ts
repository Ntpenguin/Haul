import { AgentConfig } from './types.js';

/** Is `date` within the agent's configured business hours? */
export function isWithinBusinessHours(agent: AgentConfig, date = new Date()): boolean {
  const hours = agent.business_hours?.[date.getDay()];
  if (!hours) return false; // closed that day
  const [oh, om] = hours[0].split(':').map(Number);
  const [ch, cm] = hours[1].split(':').map(Number);
  const mins = date.getHours() * 60 + date.getMinutes();
  return mins >= oh * 60 + om && mins < ch * 60 + cm;
}
