## 📋 Descrição
<!-- Descreva suas mudanças de forma clara e concisa -->

## 🎯 Tipo de Mudança
<!-- Marque o tipo relevante -->
- [ ] 🐛 Bug fix (mudança que corrige um problema)
- [ ] ✨ Nova feature (mudança que adiciona funcionalidade)
- [ ] 💥 Breaking change (fix ou feature que faria código existente parar de funcionar)
- [ ] 📝 Documentação (mudanças apenas em documentação)
- [ ] ♻️ Refatoração (mudanças que não corrigem bugs nem adicionam features)
- [ ] ⚡ Performance (mudanças que melhoram performance)
- [ ] 🧪 Testes (adiciona ou corrige testes)
- [ ] 🔧 Chore (mudanças em build, CI, etc.)

## 🔗 Issues Relacionadas
<!-- Liste issues que este PR resolve -->
Closes #(issue)

## 🧪 Como Testar
<!-- Forneça instruções detalhadas para testar suas mudanças -->

1. Rode `npm install`
2. Configure `.env.local` com...
3. Execute `npm run dev`
4. Navegue para...
5. Verifique que...

## 📸 Screenshots/Videos
<!-- Se aplicável, adicione screenshots ou videos demonstrando as mudanças -->

## ✅ Checklist do Desenvolvedor
<!-- Marque os itens completados -->
- [ ] Meu código segue as convenções do projeto
- [ ] Fiz code review do meu próprio código
- [ ] Comentei código complexo (onde necessário)
- [ ] Atualizei documentação relevante
- [ ] Minhas mudanças não geram novos warnings
- [ ] Adicionei testes que provam que meu fix/feature funciona
- [ ] Testes unitários novos e existentes passam localmente
- [ ] Mudanças dependentes foram mergeadas e publicadas

## 🔍 Code Quality
<!-- Marque os itens verificados -->
- [ ] `npm run lint` passa sem erros
- [ ] `npm run build` completa com sucesso
- [ ] `npx tsc --noEmit` não tem erros de tipo
- [ ] Testei em diferentes browsers (se aplicável)
- [ ] Testei em mobile (se aplicável)

## 🔒 Segurança
<!-- Marque os itens verificados -->
- [ ] Não há credenciais hardcoded
- [ ] Variáveis sensíveis estão em `.env`
- [ ] Validação de entrada está implementada
- [ ] Queries filtram por `tenant_id` (multi-tenant)
- [ ] Autenticação está protegida

## 📝 Notas Adicionais
<!-- Adicione quaisquer notas, concerns ou context adicional aqui -->

## 🎨 Design System
<!-- Se mudanças de UI, verifique: -->
- [ ] Usa cores do design system (`crm-primary`, `wa-bg-panel`, etc.)
- [ ] Usa componentes reutilizáveis (`Button`, `Input`, `Card`)
- [ ] Responsivo (mobile, tablet, desktop)
- [ ] Acessível (ARIA labels, keyboard navigation)

## ⚡ Performance
<!-- Se mudanças de performance, responda: -->
- Qual era a performance antes?
- Qual é a performance agora?
- Como foi medida?

## 📚 Documentação Atualizada
<!-- Liste arquivos de documentação modificados -->
- [ ] README.md
- [ ] CONTRIBUTING.md
- [ ] API docs (TSDoc)
- [ ] `.env.local.example`
- [ ] Outros: ___________

---

**Para Reviewers**: 
<!-- Foque especialmente em: -->
- Segurança multi-tenant
- Performance de queries
- Consistência com design system
- Testes adequados

<!-- Obrigado por contribuir! 🚀 -->
