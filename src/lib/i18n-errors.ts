export function translateAuthError(message: string | undefined): string {
  if (!message) return "Algo deu errado. Tente novamente.";
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (m.includes("user already registered") || m.includes("already registered"))
    return "Este e-mail já está cadastrado. Faça login.";
  if (m.includes("password should be at least"))
    return "A senha deve ter pelo menos 6 caracteres.";
  if (m.includes("password") && m.includes("pwned"))
    return "Esta senha apareceu em vazamentos. Escolha outra.";
  if (m.includes("invalid email") || m.includes("email")) return "E-mail inválido.";
  if (m.includes("rate limit")) return "Muitas tentativas. Aguarde um instante.";
  if (m.includes("network")) return "Falha de conexão. Verifique sua internet.";
  return "Não foi possível concluir. Tente novamente.";
}