const API_URL = "http://localhost:8000";

// Fetch menu items
export async function getMenu() {
  const response = await fetch(`${API_URL}/menu`);

  if (!response.ok) {
    throw new Error("Failed to fetch menu");
  }

  return response.json();
}

// Log in with name, mobile number, and password
export async function login(name, mobileNumber, password) {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      mobile_number: mobileNumber,
      password,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Login failed");
  }

  return data;
}

// Get the currently logged-in user
export async function getMe(token) {
  const response = await fetch(`${API_URL}/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Could not verify login");
  }

  return data;
}

// Change the logged-in user's password
export async function changePassword(token, currentPassword, newPassword) {
  const response = await fetch(`${API_URL}/auth/change-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Could not change password");
  }

  return data;
}

// Get the logged-in customer's orders
export async function getMyOrders(token) {
  const response = await fetch(`${API_URL}/orders/my`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Could not fetch your orders");
  }

  return data;
}

// Get the logged-in customer's account summary and history
export async function getMyAccount(token) {
  const response = await fetch(`${API_URL}/orders/account/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Could not fetch your account");
  }

  return data;
}

// Create or update a lunch/dinner order
export async function saveMealOrder(token, mealType, eating, cart) {
  const items = Object.entries(cart)
    .filter(([, quantity]) => quantity > 0)
    .map(([menuItemId, quantity]) => ({
      menu_item_id: Number(menuItemId),
      quantity,
    }));

  const response = await fetch(`${API_URL}/orders/${mealType}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      eating,
      items: eating ? items : [],
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Could not save your order");
  }

  return data;
}
// Get all customers (admin only)
export async function getCustomers(token) {
  const response = await fetch(`${API_URL}/auth/users`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Could not fetch customers");
  }

  return data;
}

// Create a customer (admin only)
export async function createCustomer(token, customer) {
  const response = await fetch(`${API_URL}/auth/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(customer),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Could not create customer");
  }

  return data;
}

// Reset a customer's password (admin only)
export async function resetCustomerPassword(
  token,
  userId,
  temporaryPassword
) {
  const response = await fetch(
    `${API_URL}/auth/users/${userId}/reset-password`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        temporary_password: temporaryPassword,
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Could not reset password");
  }

  return data;
}

// Deactivate a customer (admin only)
export async function deactivateCustomer(token, userId) {
  const response = await fetch(`${API_URL}/auth/users/${userId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Could not deactivate customer");
  }

  return data;
}

// Get all customer orders for a selected date (admin only)
export async function getAdminOrders(token, orderDate) {
  const response = await fetch(
    `${API_URL}/orders/admin?order_date=${encodeURIComponent(orderDate)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Could not fetch customer orders");
  }

  return data;
}


 // Get one customer's account summary and payment history (admin only)
export async function getCustomerAccount(token, userId) {
  const response = await fetch(
    `${API_URL}/orders/admin/customers/${userId}/account`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Could not fetch customer account");
  }

  return data;
}

// Add a deposit to a customer's account
export async function addCustomerDeposit(token, userId, amount, note = "") {
  const response = await fetch(
    `${API_URL}/orders/admin/customers/${userId}/deposit`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        user_id: userId,
        amount: Number(amount),
        note,
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Could not add deposit");
  }

  return data;
}

// Record a direct payment against a customer's outstanding meals
export async function recordCustomerPayment(
  token,
  userId,
  amount,
  note = ""
) {
  const response = await fetch(
    `${API_URL}/orders/admin/customers/${userId}/payment`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        user_id: userId,
        amount: Number(amount),
        note,
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Could not record payment");
  }

  return data;
}

// Apply the customer's available deposit credit to unpaid meals
export async function applyCustomerCredit(token, userId) {
  const response = await fetch(
    `${API_URL}/orders/admin/customers/${userId}/apply-credit`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Could not apply credit");
  }

  return data;
}