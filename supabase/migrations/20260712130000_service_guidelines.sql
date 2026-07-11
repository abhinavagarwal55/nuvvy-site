-- Editable, translatable service guidelines (the gardener "Do's / Don'ts" list).
-- Moves the previously-hardcoded DOS_LIST / DONTS_LIST into the DB so admins can
-- edit them, with AI translate-on-write for hi/kn (same model as special tasks /
-- internal notes). English is canonical and the fallback.

CREATE TABLE IF NOT EXISTS public.service_guidelines (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind               text NOT NULL CHECK (kind IN ('do', 'dont')),
  text               text NOT NULL,
  text_hi            text,
  text_kn            text,
  translation_status text NOT NULL DEFAULT 'pending'
    CHECK (translation_status IN ('pending', 'done', 'failed')),
  translated_at      timestamptz,
  order_index        integer NOT NULL,
  is_active          boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.service_guidelines ENABLE ROW LEVEL SECURITY;

-- Seed the current guidelines with reviewed Hindi + Kannada so they render
-- translated from day one (status 'done'). Admins can edit; English edits
-- re-translate via the app.
INSERT INTO public.service_guidelines (kind, text, text_hi, text_kn, translation_status, translated_at, order_index) VALUES
  ('do', 'Greet the customer at entry.',
   'प्रवेश करते समय ग्राहक का अभिवादन करें।',
   'ಪ್ರವೇಶದ ಸಮಯದಲ್ಲಿ ಗ್ರಾಹಕರನ್ನು ಸ್ವಾಗತಿಸಿ.',
   'done', now(), 1),
  ('do', 'After service, tell customer about what you did, issues identified and what you could not do.',
   'सेवा के बाद, ग्राहक को बताएं कि आपने क्या किया, कौन-सी समस्याएं मिलीं और क्या नहीं कर पाए।',
   'ಸೇವೆಯ ನಂತರ, ನೀವು ಏನು ಮಾಡಿದಿರಿ, ಯಾವ ಸಮಸ್ಯೆಗಳು ಕಂಡುಬಂದವು ಮತ್ತು ಏನು ಮಾಡಲಾಗಲಿಲ್ಲ ಎಂದು ಗ್ರಾಹಕರಿಗೆ ತಿಳಿಸಿ.',
   'done', now(), 2),
  ('do', 'Ask customers about concerns or if they want additional plants.',
   'ग्राहकों से उनकी चिंताओं के बारे में पूछें या क्या उन्हें और पौधे चाहिए।',
   'ಗ್ರಾಹಕರ ಕಳವಳಗಳ ಬಗ್ಗೆ ಅಥವಾ ಅವರಿಗೆ ಹೆಚ್ಚುವರಿ ಸಸ್ಯಗಳು ಬೇಕೇ ಎಂದು ಕೇಳಿ.',
   'done', now(), 3),
  ('do', 'Call your horticulturist if you don''t know what to do.',
   'अगर आपको समझ न आए कि क्या करना है तो अपने बागवानी विशेषज्ञ को कॉल करें।',
   'ಏನು ಮಾಡಬೇಕೆಂದು ತಿಳಿಯದಿದ್ದರೆ ನಿಮ್ಮ ತೋಟಗಾರಿಕೆ ತಜ್ಞರಿಗೆ ಕರೆ ಮಾಡಿ.',
   'done', now(), 4),
  ('do', 'If you apply neem oil, tell customer to not visit garden for 2-3 hours.',
   'अगर आप नीम का तेल लगाते हैं, तो ग्राहक को 2-3 घंटे तक बगीचे में न जाने के लिए कहें।',
   'ನೀವು ಬೇವಿನ ಎಣ್ಣೆ ಹಚ್ಚಿದರೆ, 2-3 ಗಂಟೆಗಳ ಕಾಲ ತೋಟಕ್ಕೆ ಭೇಟಿ ನೀಡಬೇಡಿ ಎಂದು ಗ್ರಾಹಕರಿಗೆ ತಿಳಿಸಿ.',
   'done', now(), 5),
  ('dont', 'Prune plants without talking to customer first.',
   'ग्राहक से बात किए बिना पौधों की छंटाई न करें।',
   'ಮೊದಲು ಗ್ರಾಹಕರೊಂದಿಗೆ ಮಾತನಾಡದೆ ಸಸ್ಯಗಳನ್ನು ಕತ್ತರಿಸಬೇಡಿ.',
   'done', now(), 1)
ON CONFLICT DO NOTHING;
