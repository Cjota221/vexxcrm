import { redirect } from 'next/navigation';

// Cadastro desativado — acesso por convite apenas
export default function RegisterPage() {
  redirect('/login');
}
