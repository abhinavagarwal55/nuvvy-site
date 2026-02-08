"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getInternalApiUrl } from "@/lib/internal/apiUrl";

// Type for customer
interface Customer {
  id: string;
  name: string;
  phone_number: string;
  address: string;
  status: "ACTIVE" | "INACTIVE";
  created_at: string;
  updated_at: string;
}

type CustomerFormData = {
  name: string;
  phone_number: string;
  address: string;
  status: "ACTIVE" | "INACTIVE";
};

type FormErrors = Partial<Record<keyof CustomerFormData, string>>;

export default function CustomersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // Data state
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  
  // Form state
  const [formData, setFormData] = useState<CustomerFormData>({
    name: "",
    phone_number: "",
    address: "",
    status: "ACTIVE",
  });
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  
  // Fetch customers
  const fetchCustomers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams();
      if (searchQuery) params.append("q", searchQuery);
      if (statusFilter !== "all") params.append("status", statusFilter);
      
      const response = await fetch(getInternalApiUrl(`/api/internal/customers?${params.toString()}`));
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch customers");
      }
      
      setCustomers(data.customers || []);
      setTotalCount(data.totalCount || 0);
    } catch (err) {
      console.error("Error fetching customers:", err);
      setError(err instanceof Error ? err.message : "Failed to load customers");
    } finally {
      setLoading(false);
    }
  }, [searchQuery, statusFilter]);
  
  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);
  
  // Handle modal open
  const handleOpenModal = (customer?: Customer) => {
    if (customer) {
      // Edit mode
      setModalMode("edit");
      setEditingCustomerId(customer.id);
      setFormData({
        name: customer.name || "",
        phone_number: customer.phone_number || "",
        address: customer.address || "",
        status: customer.status || "ACTIVE",
      });
    } else {
      // Create mode
      setModalMode("create");
      setEditingCustomerId(null);
      setFormData({
        name: "",
        phone_number: "",
        address: "",
        status: "ACTIVE",
      });
    }
    setFormErrors({});
    setSubmitError(null);
    setSaveSuccess(null);
    setIsModalOpen(true);
  };
  
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setModalMode("create");
    setEditingCustomerId(null);
    setFormData({
      name: "",
      phone_number: "",
      address: "",
      status: "ACTIVE",
    });
    setFormErrors({});
    setSubmitError(null);
    setSaveSuccess(null);
  };
  
  // Validate form
  const validateForm = (): boolean => {
    const errors: FormErrors = {};
    
    if (!formData.name.trim()) {
      errors.name = "Name is required";
    }
    
    if (!formData.phone_number.trim()) {
      errors.phone_number = "Phone number is required";
    }
    
    if (!formData.address.trim()) {
      errors.address = "Address is required";
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };
  
  // Handle submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSaveSuccess(null);
    
    if (!validateForm()) {
      return;
    }
    
    setIsSubmitting(true);
    
    const customerNameBeforeUpdate = modalMode === "edit" ? formData.name : null;
    
    try {
      const apiPath = modalMode === "edit" && editingCustomerId
        ? `/api/internal/customers/${editingCustomerId}`
        : "/api/internal/customers";
      const method = modalMode === "edit" ? "PUT" : "POST";
      
      const response = await fetch(getInternalApiUrl(apiPath), {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || "Failed to save customer");
      }
      
      // Success
      if (modalMode === "create") {
        // Refetch after create
        await fetchCustomers();
        setTimeout(() => {
          handleCloseModal();
        }, 1500);
      } else {
        // Update in-place for edit
        const updatedCustomer = result.data;
        if (updatedCustomer) {
          setCustomers((prev) =>
            prev.map((c) => (c.id === editingCustomerId ? { ...c, ...updatedCustomer } : c))
          );
        }
        
        // Show success message in modal
        const successText = customerNameBeforeUpdate
          ? `${customerNameBeforeUpdate} updated successfully`
          : "Customer updated successfully";
        
        setSaveSuccess(successText);
        
        // Auto-close after 1 second
        setTimeout(() => {
          setSaveSuccess(null);
          handleCloseModal();
        }, 1000);
      }
    } catch (err) {
      console.error("Error saving customer:", err);
      setSubmitError(err instanceof Error ? err.message : "Failed to save customer");
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const isFormValid = (): boolean => {
    return (
      formData.name.trim() !== "" &&
      formData.phone_number.trim() !== "" &&
      formData.address.trim() !== ""
    );
  };
  
  // Handle create shortlist
  const handleCreateShortlist = (customer: Customer) => {
    router.push(`/internal/shortlists/new?customerId=${customer.id}`);
  };
  
  // Filter customers
  const displayCustomers = useMemo(() => {
    return customers;
  }, [customers]);
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
        <p className="text-sm text-gray-600 mt-1">Manage and view all customers</p>
      </div>
      
      {/* Add Customer Button */}
      <div className="flex justify-end">
        <button
          onClick={() => handleOpenModal()}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Add Customer
        </button>
      </div>
      
      {/* Filters */}
      <div className="bg-white p-3 lg:p-4 rounded-lg border border-gray-200 space-y-3 lg:space-y-4">
        {/* Search */}
        <div>
          <label htmlFor="search" className="block text-sm font-medium text-gray-700 mb-1">
            Search
          </label>
          <input
            id="search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name or phone number..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        {/* Status Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Status
          </label>
          <div className="flex rounded-md shadow-sm">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-2 text-sm font-medium transition-colors rounded-l-md border ${
                statusFilter === "all"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-50 border-gray-300"
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("active")}
              className={`px-3 py-2 text-sm font-medium transition-colors border-l border-gray-300 ${
                statusFilter === "active"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("inactive")}
              className={`px-3 py-2 text-sm font-medium transition-colors border-l border-gray-300 rounded-r-md ${
                statusFilter === "inactive"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              Inactive
            </button>
          </div>
        </div>
        
        {/* Count */}
        <div className="text-sm text-gray-600">
          Showing {displayCustomers.length} of {totalCount} customers
        </div>
      </div>
      
      {/* Loading State */}
      {loading && customers.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">Loading customers...</p>
        </div>
      )}
      
      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Error: {error}</p>
        </div>
      )}
      
      {/* Customers Table */}
      {!loading && !error && (
        <>
          {customers.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
              <p className="text-gray-500">No customers found</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Phone Number
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Address
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Updated
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider sticky right-0 bg-gray-50">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {displayCustomers.map((customer) => (
                      <tr key={customer.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {customer.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {customer.phone_number}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          <div className="line-clamp-2 max-w-md">
                            {customer.address}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                              customer.status === "ACTIVE"
                                ? "bg-green-100 text-green-800"
                                : "bg-gray-100 text-gray-800"
                            }`}
                          >
                            {customer.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {new Date(customer.updated_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium sticky right-0 bg-white">
                          <button
                            onClick={() => handleOpenModal(customer)}
                            className="text-blue-600 hover:text-blue-900 mr-4"
                          >
                            Edit
                          </button>
                          {customer.status === "ACTIVE" && (
                            <button
                              onClick={() => handleCreateShortlist(customer)}
                              className="text-green-600 hover:text-green-900"
                            >
                              Create Shortlist
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
      
      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
              onClick={handleCloseModal}
            />
            
            {/* Modal Content */}
            <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              {/* Modal Header */}
              <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
                <h2 className="text-xl font-semibold text-gray-900">
                  {modalMode === "edit" ? "Edit Customer" : "Add Customer"}
                </h2>
                <button
                  onClick={handleCloseModal}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              {/* Modal Body */}
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {/* Error Message */}
                {submitError && (
                  <div className="bg-red-50 border border-red-200 rounded-md p-3">
                    <p className="text-sm text-red-800">{submitError}</p>
                  </div>
                )}
                
                {/* Name */}
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="name"
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      formErrors.name ? "border-red-300" : "border-gray-300"
                    }`}
                  />
                  {formErrors.name && (
                    <p className="mt-1 text-sm text-red-600">{formErrors.name}</p>
                  )}
                </div>
                
                {/* Phone Number */}
                <div>
                  <label htmlFor="phone_number" className="block text-sm font-medium text-gray-700 mb-1">
                    Phone Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="phone_number"
                    type="tel"
                    value={formData.phone_number}
                    onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      formErrors.phone_number ? "border-red-300" : "border-gray-300"
                    }`}
                  />
                  {formErrors.phone_number && (
                    <p className="mt-1 text-sm text-red-600">{formErrors.phone_number}</p>
                  )}
                </div>
                
                {/* Address */}
                <div>
                  <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">
                    Address <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    id="address"
                    rows={3}
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      formErrors.address ? "border-red-300" : "border-gray-300"
                    }`}
                  />
                  {formErrors.address && (
                    <p className="mt-1 text-sm text-red-600">{formErrors.address}</p>
                  )}
                </div>
                
                {/* Status */}
                <div>
                  <label htmlFor="status" className="block text-sm font-medium text-gray-700 mb-1">
                    Status <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="status"
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as "ACTIVE" | "INACTIVE" })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </div>
                
                {/* Success Message */}
                {saveSuccess && (
                  <div className="mb-4 rounded-md bg-green-50 border border-green-200 px-4 py-2 text-sm text-green-800">
                    ✓ {saveSuccess}
                  </div>
                )}
                
                {/* Modal Footer */}
                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    disabled={isSubmitting || saveSuccess !== null}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !isFormValid() || saveSuccess !== null}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting
                      ? (modalMode === "edit" ? "Saving..." : "Creating...")
                      : (modalMode === "edit" ? "Save Changes" : "Add Customer")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
