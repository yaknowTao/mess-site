const API_URL = import.meta.env.VITE_API_URL;

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
export async function saveMealOrder(
  token,
  mealType,
  eating,
  cart,
  orderDate
) {
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
      order_date: orderDate,
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

async function patchOrderAction(token, path) {
  const response = await fetch(`${API_URL}${path}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.detail || "Could not update order");
  }

  return data;
}

export function markOrderSeen(token, orderId) {
  return patchOrderAction(
    token,
    `/orders/admin/${orderId}/seen`
  );
}

export function markOrderPreparing(token, orderId) {
  return patchOrderAction(
    token,
    `/orders/admin/${orderId}/preparing`
  );
}

export function markOrderCompleted(token, orderId) {
  return patchOrderAction(
    token,
    `/orders/admin/${orderId}/completed`
  );
}

export function reopenOrderForUpdate(token, orderId) {
  return patchOrderAction(
    token,
    `/orders/admin/${orderId}/reopen`
  );
}

export function requestOrderUpdate(token, orderId) {
  return patchOrderAction(
    token,
    `/orders/${orderId}/request-update`
  );
}
// Customer asks the admin to confirm that an outstanding completed order was paid.
export async function requestPaymentConfirmation(token, orderId) {
  const response = await fetch(`${API_URL}/orders/${orderId}/payment-request`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || "Could not request payment confirmation");
  return data;
}

// Admin confirms a customer's reported payment.
export async function confirmCustomerPaymentRequest(token, requestId) {
  const response = await fetch(`${API_URL}/orders/admin/payment-requests/${requestId}/confirm`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || "Could not confirm payment request");
  return data;
}


export async function getAdminCalendar(token, year, month) {
  const response = await fetch(`${API_URL}/orders/admin/calendar?year=${year}&month=${month}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || "Could not fetch calendar");
  return data;
}

export async function getDayOff(token, date) {
  const data = await getDaysOff(token, date, date);
  return data[0] || null;
}

export async function getDaysOff(token, fromDate = "", toDate = "") {
  const response = await fetch(`${API_URL}/orders/days-off?${new URLSearchParams({ ...(fromDate ? { from_date: fromDate } : {}), ...(toDate ? { to_date: toDate } : {}) }).toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || "Could not fetch mess closures");
  return data;
}

export async function createDayOff(token, date, reason = "") {
  const params = new URLSearchParams({ target_date: date });
  if (reason.trim()) params.set("reason", reason.trim());
  const response = await fetch(`${API_URL}/orders/admin/days-off?${params.toString()}`, {
    method: "POST", headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || "Could not close the mess");
  return data;
}

export async function removeDayOff(token, date) {
  const response = await fetch(`${API_URL}/orders/admin/days-off/${date}`, {
    method: "DELETE", headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || "Could not reopen the mess");
  return data;
}

export async function getAdminMenu(token) {
  const response = await fetch(`${API_URL}/menu/admin`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || "Could not fetch menu");
  return data;
}

export async function createMenuItem(token, item) {
  const response = await fetch(`${API_URL}/menu`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(item),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || "Could not create menu item");
  return data;
}

export async function updateMenuItem(token, itemId, item) {
  const response = await fetch(`${API_URL}/menu/${itemId}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(item),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || "Could not update menu item");
  return data;
}

export async function archiveMenuItem(token, itemId) {
  const response = await fetch(`${API_URL}/menu/${itemId}`, {
    method: "DELETE", headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || "Could not remove menu item");
  return data;
}
