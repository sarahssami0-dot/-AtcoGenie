# Requirements Specification: AtcoGenie

## 1. Introduction
AtcoGenie is an AI-powered conversational analytics platform designed to enable authorized users to interact with organizational data through a natural language interface. This document outlines the functional and non-functional requirements for the system, specifically focusing on data modeling and security.

## 2. Core Functional Requirements

### 2.1 Identity & Authentication
- The system MUST authenticate users using the organization's corporate identity provider (Active Directory).
- The system MUST synchronize user attributes (e.g., Department, Role, Employee ID) from the authoritative Human Capital Management System (HCMS).
- The system MUST automatically de-provision access for users who are terminated or leave the organization.
- **Reference Requirement:** Ensure seamless Single Sign-On (SSO) experience where possible.

### 2.2 Conversational Interface
- The application MUST provide a web-based chat interface allowing users to input natural language queries.
- The system MUST maintain context across multiple turns of conversation (multi-turn logic).
- The system MUST support standard chat features including:
    - Chat History persistence.
    - Session management (New Chat, Archive, Rename, Delete).
    - Rich text formatting of responses (Tables, Code blocks) with copy capabilities.
    - Search functionality within chat history.
    - **Folder UI:** Users MUST be able to create folders to organize their chat sessions into logical groupings (e.g., by project, topic, or priority).

### 2.3 Scheduler
- The system MUST provide a Scheduler feature that allows users to automate prompt execution based on defined timing and conditions.
- Users MUST be able to:
    - Enter a prompt once and configure when and how often it should run (e.g., daily at 9 AM, weekly on Mondays).
    - Define conditions or triggers for scheduled prompts.
    - Receive results automatically without manual intervention.
- Scheduled prompts MUST execute with the same security context and data access permissions as the user who created them.
- The system MUST provide a management interface to view, edit, pause, or delete scheduled tasks.
- Results from scheduled prompts MUST be stored and accessible to the user for later review.

### 2.4 Data Querying & Orchestration
- The system MUST interpret natural language inputs and dynamically generate queries to retrieve accurate data.
- The system MUST support fetching data from multiple disparate internal sources (e.g., HCMS, Identity DB, ERP systems).
- The system MUST robustly handle partial data retrieval failures (e.g., if one source is down, available data is still returned with a distinct warning indicator).
- The system MUST NOT hallucinate data; all numerical and factual responses must be grounded in retrieved records.

## 3. Data Modeling & Security Requirements

### 3.1 Data Schema
- The system MUST maintain a canonical data model representing the organization's structure, including but not limited to:
    - **Employees:** Profiles, designations, contact details.
    - **Organization Hierarchy:** Departments, divisions, units, and reporting lines.
    - **Identity Mappings:** AD accounts linked to physical employee records.
- The data model MUST support historical tracking of critical changes (e.g., employee transfers between departments or role changes).

### 3.2 Authorization & Access Control
- **Zero Trust Data Access:** Users MUST only be able to view data explicitly authorized for their specific attributes (Role, Department, Clearance Level).
- **Data Access Enforcement:**
    - Access control MUST be enforced at the foundation layer of data retrieval.
    - The system MUST prevent queries from returning unauthorized records, even if the user explicitly asks for them (e.g., "Show me the CEO's salary").
- **Hierarchical Access Rules:**
    - Managers MUST have visibility into data regarding their direct and indirect reports.
    - Department Heads MUST have visibility into data regarding their entire assigned hierarchy.
    - Regular users MUST be restricted to their own data or public organization data.

### 3.3 Security Compliance & Auditing
- The system MUST log all queries and data access attempts (Audit Trail).
- The system MUST sanitize all inputs to prevent common injection attacks (SQL Injection, Prompt Injection).
- Sensitive fields (e.g., Salary, PII) MUST be masked or redacted unless the user holds a specific privileged role.

## 4. Non-Functional Requirements
- **Performance:** System responses to standard queries should be generated within acceptable timeframes (latency targets).
- **Scalability:** The data model must support organizational growth without requiring schema refactoring.
- **Availability:** The system must remain operational even if non-critical data sources are temporarily unavailable.

---

## 5. Problem Statement & Current Gaps

### 5.1 Current System Landscape

The organization currently operates multiple enterprise systems, each with its own distinct security architecture, all controlled at the application level:

#### **Softronics ERP Platform**
The primary enterprise resource planning system that houses two major applications:

1. **Pharma Pulse**
   - **Security Model:** Role-based and Team-based security
   - **Access Control:** Users are assigned specific Roles and Teams, which determine their data visibility and permissible actions within the application.

2. **People Partner**
   - **Security Model:** Payroll Group-based security
   - **Sub-Applications:**
     - **HR Application:** Restricted exclusively to HR team members.
     - **ESS (Employee Self-Service):** Accessible to all employees for personal functions such as:
       - Attendance tracking
       - Leave applications
       - Performance appraisals
       - Payroll information access

#### **Centralized Security Provisioning**
All Softronics ERP systems are managed through a centralized **"Security" application** that controls the provisioning of Form-level rights and access permissions across the platform.

#### **SAP**
The organization also utilizes SAP as a core enterprise system. AtcoGenie will integrate with SAP to provide unified access to its data alongside other organizational systems.

### 5.2 The Challenge

**We do not currently have a streamlined process for fetching data securely across these systems in a way that is holistic, scalable, and foolproof.**

The core challenges include:

- **Fragmented Security Models:** Each system implements application-level security differently:
  - Pharma Pulse uses Roles and Teams
  - People Partner uses Payroll Groups
  - HR app has team-level restrictions
  - ESS has employee-level self-service boundaries
  - SAP has its own authorization framework
  
  There is no unified framework to translate these diverse security models into consistent data access rules when querying across systems.

- **No Centralized Data Governance:** When attempting to aggregate or query data across multiple systems (e.g., "Show me all project expenses handled by my team"), there is no standardized mechanism to ensure that the original security boundaries of each source system are preserved and respected.

- **Scalability & Maintenance Challenges:** 
  - Adding new data sources requires manually implementing security checks for each integration point.
  - Organizational changes (e.g., restructuring departments) require updates across multiple disconnected security configurations.
  - This manual, fragmented approach is error-prone and does not scale.

- **Lack of Foolproof Guarantees:** The current approach relies on application-level security checks that must be manually replicated for each data access path. There is no architectural layer that fundamentally prevents unauthorized data from being retrieved if any integration is misconfigured.

### 5.3 Objective

**The objective is to design and implement a secure data access architecture that:**
- Respects the existing security models of all source systems
- Provides a unified, scalable approach to data retrieval
- Guarantees that users can only access data they are authorized to view, regardless of how the query is constructed
- Can adapt to organizational changes and new data sources without requiring extensive manual reconfiguration
