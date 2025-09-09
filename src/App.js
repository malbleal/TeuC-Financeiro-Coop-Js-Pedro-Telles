import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

// Configuração do Supabase com suas credenciais
const supabaseUrl = 'https://xvicbtwsebqpgilcdjni.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2aWNidHdzZWJxcGdpbGNkam5pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTczNTY4MzcsImV4cCI6MjA3MjkzMjgzN30.xK5JHJkmHgy6iD0GsE80ZPNu-mzoP1JHMN4wXjA-mgo';
const supabase = createClient(supabaseUrl, supabaseKey);

function App() {
  // Inicializar estados com localStorage para persistir sessão
  const [currentPage, setCurrentPage] = useState(() => {
    const savedUser = localStorage.getItem('teuc_user');
    return savedUser ? 'dashboard' : 'login';
  });

  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem('teuc_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Estados para dados
  const [incomes, setIncomes] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [users, setUsers] = useState([]);
  const [accessRequests, setAccessRequests] = useState([]);

  // Estados para modais
  const [showIncomeForm, setShowIncomeForm] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [showCategoryForm, setShowCategoryForm] = useState(false);
  const [showAccountForm, setShowAccountForm] = useState(false);

  // Verificar token de ativação na URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    if (token) {
      setCurrentPage('activate');
    }
  }, []);

  // Carregar dados ao fazer login
  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    try {
      // Filtrar dados por user_id para cada usuário ver apenas seus dados
      const [incomesRes, expensesRes, categoriesRes, accountsRes, usersRes, accessRequestsRes] = await Promise.all([
        supabase.from('incomes').select('*').eq('user_id', user.id),
        supabase.from('expenses').select('*').eq('user_id', user.id),
        supabase.from('categories').select('*').eq('user_id', user.id),
        supabase.from('accounts').select('*').eq('user_id', user.id),
        user?.username === 'admin' ? supabase.from('users').select('*') : Promise.resolve({ data: [] }),
        user?.username === 'admin' ? supabase.from('access_requests').select('*').order('created_at', { ascending: false }) : Promise.resolve({ data: [] })
      ]);

      setIncomes(incomesRes.data || []);
      setExpenses(expensesRes.data || []);
      setCategories(categoriesRes.data || []);
      setAccounts(accountsRes.data || []);
      setUsers(usersRes.data || []);
      setAccessRequests(accessRequestsRes.data || []);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      // Se as tabelas não existirem, criar dados padrão
      if (error.message.includes('relation') && error.message.includes('does not exist')) {
        console.log('Algumas tabelas não existem ainda. Isso é normal na primeira execução.');
      }
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    const formData = new FormData(e.target);
    const username = formData.get('username');
    const password = formData.get('password');

    try {
      // Primeiro, tentar buscar o usuário sem filtro de status para verificar se existe
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .eq('password', password)
        .single();

      if (userError || !userData) {
        setMessage('Credenciais inválidas');
      } else {
        // Verificar se o usuário tem status aprovado ou se é admin
        if (userData.status === 'approved' || userData.username === 'admin') {
          setUser(userData);
          // Salvar usuário no localStorage para persistir sessão
          localStorage.setItem('teuc_user', JSON.stringify(userData));
          setCurrentPage('dashboard');
          setMessage('Login realizado com sucesso!');
        } else if (userData.status === 'pending') {
          setMessage('Usuário aguardando aprovação do administrador');
        } else if (userData.status === 'removed') {
          setMessage('Acesso removido pelo administrador');
        } else {
          setMessage('Usuário não aprovado');
        }
      }
    } catch (error) {
      console.error('Erro no login:', error);
      setMessage('Erro ao fazer login: ' + error.message);
    }

    setLoading(false);
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    const formData = new FormData(e.target);
    const fullname = formData.get('fullname');
    const email = formData.get('email');
    const requestMessage = formData.get('message') || '';

    try {
      // Verificar se já existe uma solicitação com este email
      const { data: existingRequest } = await supabase
        .from('access_requests')
        .select('email')
        .eq('email', email)
        .eq('status', 'pending')
        .single();

      if (existingRequest) {
        setMessage('Já existe uma solicitação pendente para este email');
        setLoading(false);
        return;
      }

      // Inserir solicitação na tabela access_requests
      const { data, error } = await supabase
        .from('access_requests')
        .insert([
          {
            email: email,
            full_name: fullname,
            message: requestMessage,
            status: 'pending'
          }
        ]);

      if (error) throw error;

      setMessage('Solicitação enviada com sucesso! Aguarde a aprovação do administrador.');
      e.target.reset(); // Limpar formulário

      // Voltar para login após 3 segundos
      setTimeout(() => {
        setCurrentPage('login');
        setMessage('');
      }, 3000);

    } catch (error) {
      console.error('Erro ao enviar solicitação:', error);
      setMessage('Erro ao enviar solicitação: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const approveUser = async (userId) => {
    try {
      await supabase.from('users').update({ status: 'approved' }).eq('id', userId);
      setMessage('Usuário aprovado com sucesso!');
      loadData();
    } catch (error) {
      setMessage('Erro ao aprovar usuário: ' + error.message);
    }
  };

  const rejectUser = async (userId) => {
    try {
      await supabase.from('users').delete().eq('id', userId);
      setMessage('Usuário rejeitado!');
      loadData();
    } catch (error) {
      setMessage('Erro ao rejeitar usuário: ' + error.message);
    }
  };

  // Nova função para remover acesso do usuário
  const removeUserAccess = async (userId, username) => {
    if (window.confirm(`Tem certeza que deseja remover o acesso de ${username}?`)) {
      try {
        await supabase.from('users').update({ status: 'removed' }).eq('id', userId);
        setMessage('Acesso do usuário removido com sucesso!');
        loadData();
      } catch (error) {
        setMessage('Erro ao remover acesso: ' + error.message);
      }
    }
  };

  const saveIncome = async (incomeData) => {
    setLoading(true);
    try {
      // Adicionar user_id aos dados
      const dataWithUserId = { ...incomeData, user_id: user.id };
      const { error } = await supabase.from('incomes').insert([dataWithUserId]);
      if (error) throw error;

      setMessage('Receita salva com sucesso!');
      setShowIncomeForm(false);
      loadData();
    } catch (error) {
      setMessage('Erro ao salvar receita: ' + error.message);
    }
    setLoading(false);
  };

  const saveExpense = async (expenseData) => {
    setLoading(true);
    try {
      // Adicionar user_id aos dados
      const dataWithUserId = { ...expenseData, user_id: user.id };
      const { error } = await supabase.from('expenses').insert([dataWithUserId]);
      if (error) throw error;

      setMessage('Despesa salva com sucesso!');
      setShowExpenseForm(false);
      loadData();
    } catch (error) {
      setMessage('Erro ao salvar despesa: ' + error.message);
    }
    setLoading(false);
  };

  const saveCategory = async (categoryData) => {
    setLoading(true);
    try {
      // Adicionar user_id aos dados
      const dataWithUserId = { ...categoryData, user_id: user.id };
      const { error } = await supabase.from('categories').insert([dataWithUserId]);
      if (error) throw error;

      setMessage('Categoria salva com sucesso!');
      setShowCategoryForm(false);
      loadData();
    } catch (error) {
      setMessage('Erro ao salvar categoria: ' + error.message);
    }
    setLoading(false);
  };

  const saveAccount = async (accountData) => {
    setLoading(true);
    try {
      // Adicionar user_id aos dados
      const dataWithUserId = { ...accountData, user_id: user.id };
      const { error } = await supabase.from('accounts').insert([dataWithUserId]);
      if (error) throw error;

      setMessage('Conta salva com sucesso!');
      setShowAccountForm(false);
      loadData();
    } catch (error) {
      setMessage('Erro ao salvar conta: ' + error.message);
    }
    setLoading(false);
  };

  const deleteItem = async (table, id) => {
    if (window.confirm('Tem certeza que deseja remover este item?')) {
      try {
        // Garantir que só pode deletar itens do próprio usuário
        await supabase.from(table).delete().eq('id', id).eq('user_id', user.id);
        setMessage('Item removido com sucesso!');
        loadData();
      } catch (error) {
        setMessage('Erro ao remover item: ' + error.message);
      }
    }
  };

  // Função para logout
  const handleLogout = () => {
    setUser(null);
    setCurrentPage('login');
    setMessage('');
    localStorage.removeItem('teuc_user');
  };

  // Cálculos
  const totalPaidIncomes = incomes.filter(income => income.is_paid).reduce((sum, income) => sum + parseFloat(income.amount || 0), 0);
  const totalExpenses = expenses.reduce((sum, expense) => sum + parseFloat(expense.amount || 0), 0);
  const balance = totalPaidIncomes - totalExpenses;

  // Estilos
  const containerStyle = {
    minHeight: '100vh',
    backgroundColor: '#f3f4f6',
    fontFamily: 'Arial, sans-serif'
  };

  const sidebarStyle = {
    width: '250px',
    backgroundColor: '#1f2937',
    color: 'white',
    padding: '1rem',
    position: 'fixed',
    height: '100vh',
    overflowY: 'auto'
  };

  const mainContentStyle = {
    marginLeft: '250px',
    padding: '2rem'
  };

  const cardStyle = {
    backgroundColor: 'white',
    padding: '1.5rem',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    marginBottom: '1rem'
  };

  const buttonStyle = {
    padding: '0.5rem 1rem',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: 'bold'
  };

  const inputStyle = {
    width: '100%',
    padding: '0.5rem',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '0.875rem'
  };

  const modalStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  };

  const modalContentStyle = {
    backgroundColor: 'white',
    padding: '2rem',
    borderRadius: '8px',
    width: '90%',
    maxWidth: '500px',
    maxHeight: '90vh',
    overflowY: 'auto'
  };

  if (currentPage === 'login') {
    return (
      <div style={{ ...containerStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ ...cardStyle, width: '100%', maxWidth: '400px' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1f2937' }}>
              🏦 TeuC Financeiro
            </h1>
          </div>

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: '1rem' }}>
              <input type="text" name="username" required style={inputStyle} placeholder="Nome de usuário" />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <input type="password" name="password" required style={inputStyle} placeholder="Senha" />
            </div>
            <button
              type="submit"
              disabled={loading}
              style={{
                ...buttonStyle,
                width: '100%',
                backgroundColor: '#3b82f6',
                color: 'white',
                marginBottom: '1rem',
                opacity: loading ? 0.5 : 1
              }}
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <button
            onClick={() => setCurrentPage('register')}
            style={{
              ...buttonStyle,
              width: '100%',
              backgroundColor: '#6b7280',
              color: 'white'
            }}
          >
            Solicitar Acesso
          </button>

          {message && (
            <div style={{
              marginTop: '1rem',
              padding: '0.5rem',
              backgroundColor: message.includes('sucesso') ? '#d1fae5' : '#fee2e2',
              color: message.includes('sucesso') ? '#065f46' : '#991b1b',
              borderRadius: '4px',
              fontSize: '0.875rem'
            }}>
              {message}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (currentPage === 'register') {
    return (
      <div style={{ ...containerStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ ...cardStyle, width: '100%', maxWidth: '400px' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#1f2937' }}>
              Solicitar Acesso
            </h1>
          </div>

          <form onSubmit={handleRegister}>
            <div style={{ marginBottom: '1rem' }}>
              <input type="text" name="username" required style={inputStyle} placeholder="Nome de usuário" />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <input type="email" name="email" required style={inputStyle} placeholder="Email" />
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <input type="password" name="password" required style={inputStyle} placeholder="Senha" />
            </div>
            <button
              type="submit"
              disabled={loading}
              style={{
                ...buttonStyle,
                width: '100%',
                backgroundColor: '#10b981',
                color: 'white',
                marginBottom: '1rem',
                opacity: loading ? 0.5 : 1
              }}
            >
              {loading ? 'Enviando...' : 'Enviar Solicitação'}
            </button>
          </form>

          <button
            onClick={() => setCurrentPage('login')}
            style={{
              ...buttonStyle,
              width: '100%',
              backgroundColor: '#6b7280',
              color: 'white'
            }}
          >
            Voltar ao Login
          </button>

          {message && (
            <div style={{
              marginTop: '1rem',
              padding: '0.5rem',
              backgroundColor: message.includes('sucesso') ? '#d1fae5' : '#fee2e2',
              color: message.includes('sucesso') ? '#065f46' : '#991b1b',
              borderRadius: '4px',
              fontSize: '0.875rem'
            }}>
              {message}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {/* Sidebar */}
      <div style={sidebarStyle}>
        <div style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>🏦 TeuC Financeiro</h2>
          <p style={{ fontSize: '0.875rem', opacity: 0.8 }}>
            {user?.email} {user?.username === 'admin' && '(Admin)'}
          </p>
        </div>

        <nav>
          <button
            onClick={() => setCurrentPage('dashboard')}
            style={{
              ...buttonStyle,
              width: '100%',
              backgroundColor: currentPage === 'dashboard' ? '#3b82f6' : 'transparent',
              color: 'white',
              textAlign: 'left',
              marginBottom: '0.5rem'
            }}
          >
            📊 Dashboard
          </button>
          <button
            onClick={() => setCurrentPage('income')}
            style={{
              ...buttonStyle,
              width: '100%',
              backgroundColor: currentPage === 'income' ? '#3b82f6' : 'transparent',
              color: 'white',
              textAlign: 'left',
              marginBottom: '0.5rem'
            }}
          >
            💰 Receitas
          </button>
          <button
            onClick={() => setCurrentPage('expenses')}
            style={{
              ...buttonStyle,
              width: '100%',
              backgroundColor: currentPage === 'expenses' ? '#3b82f6' : 'transparent',
              color: 'white',
              textAlign: 'left',
              marginBottom: '0.5rem'
            }}
          >
            💸 Despesas
          </button>
          <button
            onClick={() => setCurrentPage('categories')}
            style={{
              ...buttonStyle,
              width: '100%',
              backgroundColor: currentPage === 'categories' ? '#3b82f6' : 'transparent',
              color: 'white',
              textAlign: 'left',
              marginBottom: '0.5rem'
            }}
          >
            📂 Categorias
          </button>
          <button
            onClick={() => setCurrentPage('accounts')}
            style={{
              ...buttonStyle,
              width: '100%',
              backgroundColor: currentPage === 'accounts' ? '#3b82f6' : 'transparent',
              color: 'white',
              textAlign: 'left',
              marginBottom: '0.5rem'
            }}
          >
            🏛️ Contas
          </button>
          {user?.username === 'admin' && (
            <button
              onClick={() => setCurrentPage('users')}
              style={{
                ...buttonStyle,
                width: '100%',
                backgroundColor: currentPage === 'users' ? '#3b82f6' : 'transparent',
                color: 'white',
                textAlign: 'left',
                marginBottom: '0.5rem'
              }}
            >
              👥 Usuários
            </button>
          )}
        </nav>

        <div style={{ marginTop: 'auto', paddingTop: '2rem' }}>
          <button
            onClick={handleLogout}
            style={{
              ...buttonStyle,
              width: '100%',
              backgroundColor: '#ef4444',
              color: 'white'
            }}
          >
            🚪 Sair
          </button>
        </div>
      </div>

      {/* Conteúdo Principal */}
      <div style={mainContentStyle}>
        {message && (
          <div style={{
            marginBottom: '1rem',
            padding: '0.75rem',
            backgroundColor: message.includes('sucesso') ? '#d1fae5' : '#fee2e2',
            color: message.includes('sucesso') ? '#065f46' : '#991b1b',
            borderRadius: '4px',
            fontSize: '0.875rem'
          }}>
            {message}
          </div>
        )}

        {/* Dashboard */}
        {currentPage === 'dashboard' && (
          <div>
            <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '2rem', color: '#1f2937' }}>
              Dashboard
            </h1>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
              <div style={{ ...cardStyle, backgroundColor: '#d1fae5' }}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', color: '#065f46', marginBottom: '0.5rem' }}>
                  Receitas Pagas
                </h3>
                <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#065f46' }}>
                  R$ {totalPaidIncomes.toFixed(2)}
                </p>
              </div>

              <div style={{ ...cardStyle, backgroundColor: '#fee2e2' }}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', color: '#991b1b', marginBottom: '0.5rem' }}>
                  Despesas
                </h3>
                <p style={{ fontSize: '2rem', fontWeight: 'bold', color: '#991b1b' }}>
                  R$ {totalExpenses.toFixed(2)}
                </p>
              </div>

              <div style={{ ...cardStyle, backgroundColor: balance >= 0 ? '#dbeafe' : '#fee2e2' }}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', color: balance >= 0 ? '#1e40af' : '#991b1b', marginBottom: '0.5rem' }}>
                  Saldo
                </h3>
                <p style={{ fontSize: '2rem', fontWeight: 'bold', color: balance >= 0 ? '#1e40af' : '#991b1b' }}>
                  R$ {balance.toFixed(2)}
                </p>
              </div>
            </div>

            {/* Saldos das Contas */}
            {accounts.length > 0 && (
              <div style={cardStyle}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '1rem' }}>
                  Saldos das Contas
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                  {accounts.map(account => (
                    <div key={account.id} style={{ padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '4px' }}>
                      <h4 style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>{account.name}</h4>
                      <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                        {account.type}
                      </p>
                      <p style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1f2937' }}>
                        R$ {parseFloat(account.initial_balance || 0).toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <p style={{ fontSize: '1.125rem', color: '#6b7280' }}>
                🚀 Dashboard funcionando!
              </p>
              <p style={{ fontSize: '0.875rem', color: '#9ca3af', marginTop: '0.5rem' }}>
                Dados personalizados para {user?.username}
              </p>
            </div>
          </div>
        )}

        {/* Receitas */}
        {currentPage === 'income' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
              <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#1f2937' }}>Receitas</h1>
              <button
                onClick={() => setShowIncomeForm(true)}
                style={{
                  ...buttonStyle,
                  backgroundColor: '#10b981',
                  color: 'white'
                }}
              >
                + Nova Receita
              </button>
            </div>

            <div style={cardStyle}>
              {incomes.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#6b7280', padding: '2rem' }}>
                  Nenhuma receita cadastrada
                </p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Descrição</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Valor</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Categoria</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Data</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Pago</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {incomes.map(income => (
                        <tr
                          key={income.id}
                          style={{
                            borderBottom: '1px solid #e5e7eb',
                            backgroundColor: income.is_paid ? '#f0fdf4' : '#fef2f2'
                          }}
                        >
                          <td style={{ padding: '0.75rem' }}>{income.description}</td>
                          <td style={{ padding: '0.75rem', fontWeight: 'bold' }}>
                            R$ {parseFloat(income.amount || 0).toFixed(2)}
                          </td>
                          <td style={{ padding: '0.75rem' }}>{income.category}</td>
                          <td style={{ padding: '0.75rem' }}>{income.date}</td>
                          <td style={{ padding: '0.75rem' }}>
                            {income.is_paid ? '✅' : '❌'}
                          </td>
                          <td style={{ padding: '0.75rem' }}>
                            <button
                              onClick={() => deleteItem('incomes', income.id)}
                              style={{
                                ...buttonStyle,
                                backgroundColor: '#ef4444',
                                color: 'white',
                                fontSize: '0.75rem'
                              }}
                            >
                              Remover
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Despesas */}
        {currentPage === 'expenses' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
              <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#1f2937' }}>Despesas</h1>
              <button
                onClick={() => setShowExpenseForm(true)}
                style={{
                  ...buttonStyle,
                  backgroundColor: '#ef4444',
                  color: 'white'
                }}
              >
                + Nova Despesa
              </button>
            </div>

            <div style={cardStyle}>
              {expenses.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#6b7280', padding: '2rem' }}>
                  Nenhuma despesa cadastrada
                </p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Descrição</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Valor</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Categoria</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Data</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Pago</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenses.map(expense => (
                        <tr key={expense.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                          <td style={{ padding: '0.75rem' }}>{expense.description}</td>
                          <td style={{ padding: '0.75rem', fontWeight: 'bold', color: '#ef4444' }}>
                            R$ {parseFloat(expense.amount || 0).toFixed(2)}
                          </td>
                          <td style={{ padding: '0.75rem' }}>{expense.category}</td>
                          <td style={{ padding: '0.75rem' }}>{expense.date}</td>
                          <td style={{ padding: '0.75rem' }}>
                            {expense.is_paid ? '✅' : '❌'}
                          </td>
                          <td style={{ padding: '0.75rem' }}>
                            <button
                              onClick={() => deleteItem('expenses', expense.id)}
                              style={{
                                ...buttonStyle,
                                backgroundColor: '#ef4444',
                                color: 'white',
                                fontSize: '0.75rem'
                              }}
                            >
                              Remover
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Categorias */}
        {currentPage === 'categories' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
              <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#1f2937' }}>Categorias</h1>
              <button
                onClick={() => setShowCategoryForm(true)}
                style={{
                  ...buttonStyle,
                  backgroundColor: '#8b5cf6',
                  color: 'white'
                }}
              >
                + Nova Categoria
              </button>
            </div>

            <div style={cardStyle}>
              {categories.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#6b7280', padding: '2rem' }}>
                  Nenhuma categoria cadastrada
                </p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
                  {categories.map(category => (
                    <div
                      key={category.id}
                      style={{
                        padding: '1rem',
                        backgroundColor: category.type === 'expense' ? '#fee2e2' : '#d1fae5',
                        borderRadius: '4px',
                        border: `2px solid ${category.type === 'expense' ? '#ef4444' : '#10b981'}`
                      }}
                    >
                      <h3 style={{
                        fontWeight: 'bold',
                        marginBottom: '0.5rem',
                        color: category.type === 'expense' ? '#991b1b' : '#065f46'
                      }}>
                        {category.name}
                      </h3>
                      <p style={{
                        fontSize: '0.875rem',
                        color: category.type === 'expense' ? '#991b1b' : '#065f46',
                        marginBottom: '1rem'
                      }}>
                        {category.type === 'expense' ? 'Despesa' : 'Receita'}
                      </p>
                      <button
                        onClick={() => deleteItem('categories', category.id)}
                        style={{
                          ...buttonStyle,
                          backgroundColor: '#ef4444',
                          color: 'white',
                          fontSize: '0.75rem'
                        }}
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Contas */}
        {currentPage === 'accounts' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
              <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#1f2937' }}>Contas</h1>
              <button
                onClick={() => setShowAccountForm(true)}
                style={{
                  ...buttonStyle,
                  backgroundColor: '#3b82f6',
                  color: 'white'
                }}
              >
                + Nova Conta
              </button>
            </div>

            <div style={cardStyle}>
              {accounts.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#6b7280', padding: '2rem' }}>
                  Nenhuma conta cadastrada
                </p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
                  {accounts.map(account => (
                    <div key={account.id} style={{ padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '4px', border: '1px solid #e5e7eb' }}>
                      <h3 style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>{account.name}</h3>
                      <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                        {account.type}
                      </p>
                      <p style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1f2937', marginBottom: '1rem' }}>
                        R$ {parseFloat(account.initial_balance || 0).toFixed(2)}
                      </p>
                      <button
                        onClick={() => deleteItem('accounts', account.id)}
                        style={{
                          ...buttonStyle,
                          backgroundColor: '#ef4444',
                          color: 'white',
                          fontSize: '0.75rem'
                        }}
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Usuários (Admin) */}
        {currentPage === 'users' && user?.username === 'admin' && (
          <div>
            <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '2rem', color: '#1f2937' }}>
              Gerenciar Usuários
            </h1>

            <div style={cardStyle}>
              {users.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#6b7280', padding: '2rem' }}>
                  Nenhum usuário encontrado
                </p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Usuário</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Email</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Status</th>
                        <th style={{ padding: '0.75rem', textAlign: 'left' }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map(userData => (
                        <tr key={userData.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                          <td style={{ padding: '0.75rem' }}>{userData.username}</td>
                          <td style={{ padding: '0.75rem' }}>{userData.email}</td>
                          <td style={{ padding: '0.75rem' }}>
                            <span style={{
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              fontSize: '0.75rem',
                              fontWeight: 'bold',
                              backgroundColor: userData.status === 'approved' ? '#d1fae5' : userData.status === 'removed' ? '#fee2e2' : '#fef3c7',
                              color: userData.status === 'approved' ? '#065f46' : userData.status === 'removed' ? '#991b1b' : '#92400e'
                            }}>
                              {userData.status === 'approved' ? 'Aprovado' : userData.status === 'removed' ? 'Removido' : 'Pendente'}
                            </span>
                          </td>
                          <td style={{ padding: '0.75rem' }}>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              {userData.status === 'pending' && (
                                <>
                                  <button
                                    onClick={() => approveUser(userData.id)}
                                    style={{
                                      ...buttonStyle,
                                      backgroundColor: '#10b981',
                                      color: 'white',
                                      fontSize: '0.75rem'
                                    }}
                                  >
                                    Aprovar
                                  </button>
                                  <button
                                    onClick={() => rejectUser(userData.id)}
                                    style={{
                                      ...buttonStyle,
                                      backgroundColor: '#ef4444',
                                      color: 'white',
                                      fontSize: '0.75rem'
                                    }}
                                  >
                                    Rejeitar
                                  </button>
                                </>
                              )}
                              {userData.status === 'approved' && userData.username !== 'admin' && (
                                <button
                                  onClick={() => removeUserAccess(userData.id, userData.username)}
                                  style={{
                                    ...buttonStyle,
                                    backgroundColor: '#f59e0b',
                                    color: 'white',
                                    fontSize: '0.75rem'
                                  }}
                                >
                                  Remover Acesso
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal Nova Receita */}
      {showIncomeForm && (
        <div style={modalStyle}>
          <div style={modalContentStyle}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '1rem' }}>
              Nova Receita
            </h3>
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.target);
              saveIncome({
                description: formData.get('description'),
                amount: formData.get('amount'),
                category: formData.get('category'),
                account: formData.get('account'),
                date: formData.get('date'),
                notes: formData.get('notes'),
                is_paid: formData.get('is_paid') === 'on'
              });
            }}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{
                  display: 'block',
                  color: '#374151',
                  fontSize: '0.875rem',
                  fontWeight: 'bold',
                  marginBottom: '0.5rem'
                }}>
                  Descrição:
                </label>
                <input type="text" name="description" required style={inputStyle} />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{
                  display: 'block',
                  color: '#374151',
                  fontSize: '0.875rem',
                  fontWeight: 'bold',
                  marginBottom: '0.5rem'
                }}>
                  Valor:
                </label>
                <input type="number" name="amount" step="0.01" required style={inputStyle} />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{
                  display: 'block',
                  color: '#374151',
                  fontSize: '0.875rem',
                  fontWeight: 'bold',
                  marginBottom: '0.5rem'
                }}>
                  Categoria:
                </label>
                <select name="category" required style={inputStyle}>
                  <option value="">Selecione uma categoria</option>
                  {categories.filter(cat => cat.type === 'income').map(category => (
                    <option key={category.id} value={category.name}>{category.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{
                  display: 'block',
                  color: '#374151',
                  fontSize: '0.875rem',
                  fontWeight: 'bold',
                  marginBottom: '0.5rem'
                }}>
                  Conta:
                </label>
                <select name="account" required style={inputStyle}>
                  <option value="">Selecione uma conta</option>
                  {accounts.map(account => (
                    <option key={account.id} value={account.name}>{account.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{
                  display: 'block',
                  color: '#374151',
                  fontSize: '0.875rem',
                  fontWeight: 'bold',
                  marginBottom: '0.5rem'
                }}>
                  Data:
                </label>
                <input type="date" name="date" style={inputStyle} />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{
                  display: 'block',
                  color: '#374151',
                  fontSize: '0.875rem',
                  fontWeight: 'bold',
                  marginBottom: '0.5rem'
                }}>
                  Observação:
                </label>
                <textarea name="notes" style={{...inputStyle, height: '60px'}} rows="2"></textarea>
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center' }}>
                  <input type="checkbox" name="is_paid" style={{ marginRight: '0.5rem' }} />
                  <span style={{ fontSize: '0.875rem' }}>Receita já foi recebida</span>
                </label>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    ...buttonStyle,
                    flex: 1,
                    backgroundColor: '#10b981',
                    color: 'white',
                    opacity: loading ? 0.5 : 1
                  }}
                >
                  {loading ? 'Salvando...' : 'Salvar'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowIncomeForm(false)}
                  style={{
                    ...buttonStyle,
                    flex: 1,
                    backgroundColor: '#6b7280',
                    color: 'white'
                  }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Nova Despesa */}
      {showExpenseForm && (
        <div style={modalStyle}>
          <div style={modalContentStyle}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '1rem' }}>
              Nova Despesa
            </h3>
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.target);
              saveExpense({
                description: formData.get('description'),
                amount: formData.get('amount'),
                category: formData.get('category'),
                account: formData.get('account'),
                date: formData.get('date'),
                notes: formData.get('notes'),
                is_paid: formData.get('is_paid') === 'on'
              });
            }}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{
                  display: 'block',
                  color: '#374151',
                  fontSize: '0.875rem',
                  fontWeight: 'bold',
                  marginBottom: '0.5rem'
                }}>
                  Descrição:
                </label>
                <input type="text" name="description" required style={inputStyle} />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{
                  display: 'block',
                  color: '#374151',
                  fontSize: '0.875rem',
                  fontWeight: 'bold',
                  marginBottom: '0.5rem'
                }}>
                  Valor:
                </label>
                <input type="number" name="amount" step="0.01" required style={inputStyle} />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{
                  display: 'block',
                  color: '#374151',
                  fontSize: '0.875rem',
                  fontWeight: 'bold',
                  marginBottom: '0.5rem'
                }}>
                  Categoria:
                </label>
                <select name="category" required style={inputStyle}>
                  <option value="">Selecione uma categoria</option>
                  {categories.filter(cat => cat.type === 'expense').map(category => (
                    <option key={category.id} value={category.name}>{category.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{
                  display: 'block',
                  color: '#374151',
                  fontSize: '0.875rem',
                  fontWeight: 'bold',
                  marginBottom: '0.5rem'
                }}>
                  Conta:
                </label>
                <select name="account" required style={inputStyle}>
                  <option value="">Selecione uma conta</option>
                  {accounts.map(account => (
                    <option key={account.id} value={account.name}>{account.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{
                  display: 'block',
                  color: '#374151',
                  fontSize: '0.875rem',
                  fontWeight: 'bold',
                  marginBottom: '0.5rem'
                }}>
                  Data:
                </label>
                <input type="date" name="date" style={inputStyle} />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{
                  display: 'block',
                  color: '#374151',
                  fontSize: '0.875rem',
                  fontWeight: 'bold',
                  marginBottom: '0.5rem'
                }}>
                  Observação:
                </label>
                <textarea name="notes" style={{...inputStyle, height: '60px'}} rows="2"></textarea>
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center' }}>
                  <input type="checkbox" name="is_paid" style={{ marginRight: '0.5rem' }} />
                  <span style={{ fontSize: '0.875rem' }}>Despesa já foi paga</span>
                </label>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    ...buttonStyle,
                    flex: 1,
                    backgroundColor: '#ef4444',
                    color: 'white',
                    opacity: loading ? 0.5 : 1
                  }}
                >
                  {loading ? 'Salvando...' : 'Salvar'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowExpenseForm(false)}
                  style={{
                    ...buttonStyle,
                    flex: 1,
                    backgroundColor: '#6b7280',
                    color: 'white'
                  }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Nova Categoria */}
      {showCategoryForm && (
        <div style={modalStyle}>
          <div style={modalContentStyle}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '1rem' }}>
              Nova Categoria
            </h3>
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.target);
              saveCategory({
                name: formData.get('name'),
                type: formData.get('type')
              });
            }}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{
                  display: 'block',
                  color: '#374151',
                  fontSize: '0.875rem',
                  fontWeight: 'bold',
                  marginBottom: '0.5rem'
                }}>
                  Nome da categoria:
                </label>
                <input type="text" name="name" required style={inputStyle} />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{
                  display: 'block',
                  color: '#374151',
                  fontSize: '0.875rem',
                  fontWeight: 'bold',
                  marginBottom: '0.5rem'
                }}>
                  Tipo:
                </label>
                <select name="type" required style={inputStyle}>
                  <option value="">Selecione o tipo</option>
                  <option value="income">Receita</option>
                  <option value="expense">Despesa</option>
                </select>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    ...buttonStyle,
                    flex: 1,
                    backgroundColor: '#8b5cf6',
                    color: 'white',
                    opacity: loading ? 0.5 : 1
                  }}
                >
                  {loading ? 'Salvando...' : 'Salvar'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCategoryForm(false)}
                  style={{
                    ...buttonStyle,
                    flex: 1,
                    backgroundColor: '#6b7280',
                    color: 'white'
                  }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Nova Conta */}
      {showAccountForm && (
        <div style={modalStyle}>
          <div style={modalContentStyle}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 'bold', marginBottom: '1rem' }}>
              Nova Conta
            </h3>
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.target);
              saveAccount({
                name: formData.get('name'),
                type: formData.get('type'),
                initial_balance: formData.get('initial_balance')
              });
            }}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{
                  display: 'block',
                  color: '#374151',
                  fontSize: '0.875rem',
                  fontWeight: 'bold',
                  marginBottom: '0.5rem'
                }}>
                  Nome da conta:
                </label>
                <input type="text" name="name" required style={inputStyle} />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{
                  display: 'block',
                  color: '#374151',
                  fontSize: '0.875rem',
                  fontWeight: 'bold',
                  marginBottom: '0.5rem'
                }}>
                  Tipo:
                </label>
                <select name="type" required style={inputStyle}>
                  <option value="">Selecione o tipo</option>
                  <option value="checking">Conta Corrente</option>
                  <option value="savings">Poupança</option>
                  <option value="investment">Investimento</option>
                  <option value="cash">Dinheiro</option>
                  <option value="credit_card">Cartão de Crédito</option>
                </select>
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{
                  display: 'block',
                  color: '#374151',
                  fontSize: '0.875rem',
                  fontWeight: 'bold',
                  marginBottom: '0.5rem'
                }}>
                  Saldo inicial:
                </label>
                <input type="number" name="initial_balance" step="0.01" defaultValue="0" style={inputStyle} />
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    ...buttonStyle,
                    flex: 1,
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    opacity: loading ? 0.5 : 1
                  }}
                >
                  {loading ? 'Salvando...' : 'Salvar'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAccountForm(false)}
                  style={{
                    ...buttonStyle,
                    flex: 1,
                    backgroundColor: '#6b7280',
                    color: 'white'
                  }}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;