import { ClassificationResponse, NormalizedTourRecord } from '../../shared/types.js';

import bookingIntents from '../../shared/bookingIntent.json' with { type: 'json' };
import bookingPhase from '../../shared/bookingPhase.json' with { type: 'json' };
import databaseRecords from '../../shared/mockDatabase.json' with { type: 'json' };
import advertiseOffers from '../../shared/advertiseOffers.json' with { type: 'json' };

export function generateSystemPrompt(
  userIntentResponse: ClassificationResponse | null,
  retrievalContext: NormalizedTourRecord[],
  conversations: any[],
): string {
  console.log('Conversations for prompt:', retrievalContext);
  let intentPartSpecification = '';
  if (userIntentResponse) {
    if (
      userIntentResponse.intent == 'Browse Tours' ||
      userIntentResponse.intent == 'Compare Tours' ||
      userIntentResponse.intent == 'Request Quote'
    ) {
      intentPartSpecification = `Your goal is to help the user find and book tours based on the provided data.`;
    } else if (
      userIntentResponse.intent == 'Modify Booking' ||
      userIntentResponse.intent == 'Cancel Tour'
    ) {
      intentPartSpecification = `Your goal is to help the user modify their existing booking based on a current reservation`;
    } else if (userIntentResponse.intent == 'Get Support') {
      intentPartSpecification = `Your goal is to provide technical support and assistance to the user regarding their tours and bookings.`;
    }
  }
  return `
  You are a helpful and knowledgeable assistant for a travel and tour agency.
  ${intentPartSpecification}
  ## Data:
  ${JSON.stringify(retrievalContext)}

  Answer the user's latest question based on the above context and your knowledge of their prior conversation:
  ${JSON.stringify(conversations)}
`;
}

export function generateClassifyIntentPrompt(msgText: string): string {
  const bookingIntentLabels = bookingIntents.reduce((accum, item) => {
    const entry = `${item.intent}: ${item.definition} \n Examples: ${JSON.stringify(item.examples)} \n`;
    accum += entry + '\n';
    return accum;
  }, '');
  return `
    Given a conversation between user and AI agent, classify the user's primary intent into one of the following labels:


    ## Booking Intent Labels (select one)
    ${bookingIntentLabels}

    If none fit, respond with: Other

    Return ONLY the label string with exact casing for the intent label.

    ## Conversation
    ${msgText}
`;
}

export function generateClassifyBookingPrompt(msgText: string): string {
  const bookingPhaseLabels = bookingPhase.reduce((accum, item) => {
    const entry = `${item.booking_phase}: ${item.definition} \n Examples: ${JSON.stringify(item.examples)} \n`;
    accum += entry + '\n';
    return accum;
  }, '');

  const tourTypeLabels = databaseRecords.tour_types.reduce((accum, item) => {
    const entry = `${item.name}: ${item.description}`;
    accum += entry + '\n';
    return accum;
  }, '');
  return `
    Given a conversation between user and AI agent, classify the user's booking phase, and tour type into one of the following labels:

    
    ## Booking Phase Labels (select one)
    ${bookingPhaseLabels}

    # Tour Type Labels (select one)
    ${tourTypeLabels}

    If none fit, respond with: Other

    Return ONLY the label string with exact casing for each of the labels ( booking phase, and tour type). These labels should be independent.

    ## Conversation
    ${msgText}
`;
}

export function generateAdvertisementPrompt(
  msgText: string,
  bookingIntentLabels: ClassificationResponse,
): string {
  return `
    Given a conversation between user and AI agent, classify the user's primary intent, booking phase, and tour type into one of the following labels:

    Requirements:
    -Check booking_phase and tourType to determine the most relevant advertisement offer.
    -Priotize booking_phase prior to tourType when selecting advertisement offer.
    
    Return ONLY the label string with exact casing.
    
    ## Offers:
    ${advertiseOffers.map((item) => `id: ${item.id}, title: ${item.title}, tour_type: ${JSON.stringify(item.tour_type)}, booking_phase: ${item.booking_phase}`).join('\n')}

    ## Booking Metadata
    ${JSON.stringify(bookingIntentLabels)}

    ## Conversation
    ${msgText}
`;
}

export function generateClassifyDestinationRecord(
  userMessage: string,
  retrievalContext: string,
): string {
  return `Given the user message and the database context, extract the most relevant destination record in JSON format with the following fields:
  - destination (string)
  - tourName (string)
  - tourTypes (comma-separated string)
  - season (string)
  - durationDays (number)
  - priceUSD (number)
  - description (string)
  
  If no relevant information is found, return empty strings or zero for numeric fields.
  ## User Message
  ${userMessage}
  
  ## Database Context
  ${retrievalContext}
  ## JSON Response
  `;
}
