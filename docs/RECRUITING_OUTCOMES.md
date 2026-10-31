# Decisions and recruiting outcomes

Your decisions sits inline after Discovery, Intake and Enrichment, connected by the ready-for-review waiting buffer. It has no jobs/hour metric. The Your decisions block emphasizes cumulative distinct recorded applications; employer rejection does not subtract an application. Declines are secondary. Recruiting outcomes is the final separate block: personal recruiter contact, rejection after applying and latest known interview stage per contacted job.

Stages: recruiter screen, hiring manager, onsite/panel, offer. Progress is separate: invited, awaiting scheduling, scheduled, completed, received. A past or accepted appointment never proves attendance. Counts are known minimums while historical email/calendar coverage is incomplete. A contact without a saved application receipt still gets a status prompt when linked to an existing canonical job.

Every contacted job has a form to confirm or update stage/progress. It uses the existing Writer interview_note action and reads back the private interview_notes file before claiming success. Structured status is a TIM note beginning PIPELINE_INTERVIEW_STATUS followed by JSON. Free-form notes stay intact. There are no direct master writes, invented scoring fields, calendar changes, or automatic retries of uncertain note saves.

The shared FORGE_APPLICATION_OUTCOME_TRACKER procedure owns Gmail and read-only Google Calendar collection, matching, dedupe and pending coverage. The health endpoint passes only minimal stage facts into the GUI, not email bodies, meeting links, contact addresses or private notes. Older automatic observations cannot overwrite a newer Tim confirmation.
