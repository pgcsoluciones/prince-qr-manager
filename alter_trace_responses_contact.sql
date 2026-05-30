-- Add contact_name and contact_phone to trace_responses
ALTER TABLE trace_responses ADD COLUMN contact_name TEXT;
ALTER TABLE trace_responses ADD COLUMN contact_phone TEXT;

-- Add same to trace_contacts (for direct storage)
ALTER TABLE trace_contacts ADD COLUMN contact_name TEXT;
ALTER TABLE trace_contacts ADD COLUMN contact_phone TEXT;
