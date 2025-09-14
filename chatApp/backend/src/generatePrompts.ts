import { ClassificationResponse, NormalizedTourRecord } from "shared/types.js";

import bookingIntents from '../../shared/bookingIntent.json' with { type: 'json' };
import bookingPhase from '../../shared/bookingPhase.json' with { type: 'json' };
import databaseRecords from '../../shared/mockDatabase.json' with { type: 'json' };


export function generateSystemPrompt(userIntentResponse: ClassificationResponse | null, retrievalContext: NormalizedTourRecord[], conversations: any[]): string {
  console.log('Conversations for prompt:', retrievalContext);
  let intentPartSpecification = ""
  if (userIntentResponse) {
    if (userIntentResponse.intent == "BrowseTours" || userIntentResponse.intent == "CompareTours" || userIntentResponse.intent == "BookTour" || userIntentResponse.intent == "RequestQuote") {
      intentPartSpecification = `Your goal is to help the user find and book tours based on the provided data.`
    } else if (userIntentResponse.intent == "ModifyBooking" || userIntentResponse.intent == "CancelTour") {
      intentPartSpecification = `Your goal is to help the user modify their existing booking based on a current reservation`
    } else if (userIntentResponse.intent == "GetSupport") {
      intentPartSpecification = `Your goal is to provide technical support and assistance to the user regarding their tours and bookings.`
    }
  }
  return `
  You are a helpful and knowledgeable assistant for a travel and tour agency.
  ${intentPartSpecification}
  ## Data:
  ${JSON.stringify(retrievalContext)}

  Answer the user's latest question based on the above context and your knowledge of their prior conversation:
  ${JSON.stringify(conversations)}
`
}


export function generateClassifyTopicPrompt(msgText:string): string{

  const bookingIntentLabels = bookingIntents.reduce((accum, item) =>{
    const entry = `${item.intent}: ${item.definition}
    `;
    accum += entry + '\n';
    return accum
  }, '')

  const bookingPhaseLabels = bookingPhase.reduce((accum, item) =>{
    const entry = `${item.booking_phase}: ${item.definition}`
    accum += entry + '\n';
    return accum
  }, '')

  const tourTypeLabels = databaseRecords.tour_types.reduce((accum, item) =>{
    const entry = `${item.name}: ${item.description}`
    accum += entry + '\n';
    return accum
  }, '')
    return `
    Given a conversation between user and AI agent, classify the user's primary intent, booking phase, and tour type into one of the following labels:

    ## Booking Intent Labels (select one)
    ${bookingIntentLabels}
    
    ## Booking Phase Labels (select one)
    ${bookingPhaseLabels}

    # Tour Type Labels (select one)
    ${tourTypeLabels}

    If none fit, respond with: Other

    Return ONLY the label string with exact casing.

    ## Conversation
    ${msgText}
`
}

export function generateClassifyDestinationRecord(userMessage: string, retrievalContext: string): string {
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
  `
}