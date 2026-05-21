
-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles viewable by owner" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Profiles updatable by owner" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Profiles insertable by owner" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- CREDITS
CREATE TABLE public.credits (
  user_id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 5,
  total_purchased INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Credits viewable by owner" ON public.credits FOR SELECT USING (auth.uid() = user_id);

-- CONVERSATIONS
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Conversations select own" ON public.conversations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Conversations insert own" ON public.conversations FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Conversations update own" ON public.conversations FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Conversations delete own" ON public.conversations FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_conversations_user_updated ON public.conversations(user_id, updated_at DESC);

-- MESSAGES
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Messages select via conversation" ON public.messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()));
CREATE POLICY "Messages insert via conversation" ON public.messages FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()));
CREATE POLICY "Messages delete via conversation" ON public.messages FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()));
CREATE INDEX idx_messages_conversation_created ON public.messages(conversation_id, created_at);

-- CHARACTER PROFILES
CREATE TABLE public.character_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name TEXT NOT NULL,
  appearance TEXT,
  base_media_id TEXT,
  base_image_url TEXT,
  alive_prompt_id TEXT,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uniq_character_profile_user_name ON public.character_profiles(user_id, lower(name));
ALTER TABLE public.character_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CP select own or public" ON public.character_profiles FOR SELECT USING (auth.uid() = user_id OR is_public = true);
CREATE POLICY "CP insert own" ON public.character_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "CP update own" ON public.character_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "CP delete own" ON public.character_profiles FOR DELETE USING (auth.uid() = user_id);

-- CHARACTERS (gerações)
CREATE TABLE public.characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  profile_id UUID REFERENCES public.character_profiles ON DELETE SET NULL,
  name TEXT,
  media_id TEXT,
  image_url TEXT,
  prompt_id TEXT,
  is_public BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Characters select own or public" ON public.characters FOR SELECT USING (auth.uid() = user_id OR is_public = true);
CREATE POLICY "Characters insert own" ON public.characters FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Characters update own" ON public.characters FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Characters delete own" ON public.characters FOR DELETE USING (auth.uid() = user_id);
CREATE INDEX idx_characters_user_created ON public.characters(user_id, created_at DESC);

-- TIMESTAMP TRIGGER FN
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_credits_touch BEFORE UPDATE ON public.credits FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_conversations_touch BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_cp_touch BEFORE UPDATE ON public.character_profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- HANDLE NEW USER
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, name) VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)));
  INSERT INTO public.credits (user_id, balance) VALUES (NEW.id, 5);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
