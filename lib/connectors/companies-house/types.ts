// The parts of Companies House responses Sleuthhound reads. The API returns
// more; fields are optional where the API leaves them out for some companies.

export type AdvancedSearchParams = {
  location?: string;
  incorporatedFrom?: string; // yyyy-mm-dd
  incorporatedTo?: string;
  sicCodes?: string[];
  companyStatus?: string;
  companyType?: string;
  nameIncludes?: string;
  size?: number;
  startIndex?: number;
};

export type Address = {
  address_line_1?: string;
  address_line_2?: string;
  locality?: string;
  region?: string;
  postal_code?: string;
  country?: string;
  premises?: string;
};

export type AdvancedSearchItem = {
  company_number: string;
  company_name: string;
  company_status?: string;
  company_type?: string;
  date_of_creation?: string;
  sic_codes?: string[];
  registered_office_address?: Address;
};

export type AdvancedSearchResult = {
  hits?: number;
  items?: AdvancedSearchItem[];
};

export type CompanyProfile = {
  company_number: string;
  company_name: string;
  company_status?: string;
  type?: string;
  date_of_creation?: string;
  sic_codes?: string[];
  registered_office_address?: Address;
  accounts?: {
    next_due?: string;
    next_made_up_to?: string;
    overdue?: boolean;
    last_accounts?: { made_up_to?: string; type?: string };
  };
  confirmation_statement?: { next_due?: string; overdue?: boolean };
};

export type Officer = {
  name: string;
  officer_role?: string;
  appointed_on?: string;
  resigned_on?: string;
  links?: { officer?: { appointments?: string } };
};

export type OfficerList = {
  total_results?: number;
  items?: Officer[];
};

export type FilingHistoryItem = {
  transaction_id: string;
  category?: string;
  type?: string;
  /** The date Companies House received it. */
  date?: string;
  /** The date it's about, such as an allotment or a change of address. */
  action_date?: string;
  description?: string;
  /** Filled into the description's template: dates, names, addresses, capital. */
  description_values?: {
    date?: string;
    made_up_date?: string;
    change_date?: string;
    old_address?: string;
    new_address?: string;
    psc_name?: string;
    notification_date?: string;
    charge_creation_date?: string;
    capital?: Array<{ currency?: string; figure?: string }>;
  };
  /** A RESOLUTIONS filing lists each resolution passed. */
  resolutions?: Array<{ category?: string; description?: string; type?: string }>;
  links?: { self?: string; document_metadata?: string };
};

export type FilingHistoryList = {
  total_count?: number;
  items?: FilingHistoryItem[];
};

export type SearchCompaniesResult = {
  total_results?: number;
  items?: Array<{ company_number: string; title: string; company_status?: string; address_snippet?: string }>;
};
