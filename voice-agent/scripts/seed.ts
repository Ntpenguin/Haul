import { createAgent, listAgents } from '../src/db/index.js';

/** Seed a demo agent so the dashboard isn't empty on first run. */
if (listAgents().length > 0) {
  console.log('Agents already exist — skipping seed.');
  process.exit(0);
}

const agent = createAgent({
  name: 'Ava',
  business_name: 'Fast Fix Work',
  greeting: 'Thanks for calling Fast Fix Work, this is Ava. How can I help you today?',
  persona:
    'You are Ava, a friendly and efficient receptionist for a moving and labor company. ' +
    'You sound human, warm, and concise. You only discuss moving/labor services.',
  goals:
    '- Understand the job (move size, date, pickup & dropoff).\n' +
    '- Answer pricing/availability questions from the knowledge base.\n' +
    '- Book an appointment when the caller is ready.\n' +
    '- Capture the caller’s name, phone, and email.\n' +
    '- Transfer to a human for anything you cannot handle.',
  knowledge_base:
    'Fast Fix Work serves Austin, TX. Two movers + truck start around $175 for a few items, ' +
    '$500 for a 1-bedroom, $800 for a 2-bedroom. Stairs and heavy/specialty items cost extra. ' +
    'We book 24–48 hours out. Hours: Mon–Fri 8am–6pm.',
} as any);

console.log('Seeded demo agent:', agent.id, agent.name);
