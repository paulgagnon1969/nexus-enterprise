import Contacts
import Foundation

struct ContactInfo: Codable {
    let id: String
    let displayName: String?
    let firstName: String?
    let lastName: String?
    let email: String?      // Primary email (first one)
    let phone: String?      // Primary phone (first one)
    let allEmails: [String] // All email addresses
    let allPhones: [String] // All phone numbers
    // Address fields
    let street: String?
    let city: String?
    let state: String?
    let zip: String?
    let country: String?
    // Organization
    let company: String?
    let jobTitle: String?
}

// US State name to abbreviation mapping
let stateAbbreviations: [String: String] = [
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
    "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
    "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID",
    "illinois": "IL", "indiana": "IN", "iowa": "IA", "kansas": "KS",
    "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
    "massachusetts": "MA", "michigan": "MI", "minnesota": "MN", "mississippi": "MS",
    "missouri": "MO", "montana": "MT", "nebraska": "NE", "nevada": "NV",
    "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
    "north carolina": "NC", "north dakota": "ND", "ohio": "OH", "oklahoma": "OK",
    "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC",
    "south dakota": "SD", "tennessee": "TN", "texas": "TX", "utah": "UT",
    "vermont": "VT", "virginia": "VA", "washington": "WA", "west virginia": "WV",
    "wisconsin": "WI", "wyoming": "WY", "district of columbia": "DC",
    // Canadian provinces
    "alberta": "AB", "british columbia": "BC", "manitoba": "MB",
    "new brunswick": "NB", "newfoundland and labrador": "NL", "nova scotia": "NS",
    "ontario": "ON", "prince edward island": "PE", "quebec": "QC", "saskatchewan": "SK",
    // Territories
    "puerto rico": "PR", "guam": "GU", "virgin islands": "VI",
    "american samoa": "AS", "northern mariana islands": "MP"
]

func normalizeState(_ state: String?) -> String? {
    guard let state = state, !state.isEmpty else { return nil }
    let trimmed = state.trimmingCharacters(in: .whitespaces)
    
    // If already a 2-letter code, uppercase and return
    if trimmed.count == 2 {
        return trimmed.uppercased()
    }
    
    // Look up in dictionary
    if let abbrev = stateAbbreviations[trimmed.lowercased()] {
        return abbrev
    }
    
    // Return as-is if not found (might be international)
    return trimmed
}

func requestContactsAccess() -> Bool {
    let store = CNContactStore()
    var granted = false
    let semaphore = DispatchSemaphore(value: 0)
    
    store.requestAccess(for: .contacts) { success, error in
        granted = success
        semaphore.signal()
    }
    
    semaphore.wait()
    return granted
}

func fetchContacts() -> [ContactInfo] {
    let store = CNContactStore()
    var contacts: [ContactInfo] = []
    
    let keys: [CNKeyDescriptor] = [
        CNContactIdentifierKey as CNKeyDescriptor,
        CNContactGivenNameKey as CNKeyDescriptor,
        CNContactFamilyNameKey as CNKeyDescriptor,
        CNContactEmailAddressesKey as CNKeyDescriptor,
        CNContactPhoneNumbersKey as CNKeyDescriptor,
        CNContactPostalAddressesKey as CNKeyDescriptor,
        CNContactOrganizationNameKey as CNKeyDescriptor,
        CNContactJobTitleKey as CNKeyDescriptor,
    ]
    
    let request = CNContactFetchRequest(keysToFetch: keys)
    
    do {
        try store.enumerateContacts(with: request) { contact, _ in
            let firstName = contact.givenName.isEmpty ? nil : contact.givenName
            let lastName = contact.familyName.isEmpty ? nil : contact.familyName
            
            var displayName: String? = nil
            if let f = firstName, let l = lastName {
                displayName = "\(f) \(l)"
            } else if let f = firstName {
                displayName = f
            } else if let l = lastName {
                displayName = l
            }
            
            // Collect all emails
            let allEmails = contact.emailAddresses.map { $0.value as String }
            let primaryEmail = allEmails.first
            
            // Collect all phones
            let allPhones = contact.phoneNumbers.map { $0.value.stringValue }
            let primaryPhone = allPhones.first
            
            // Get primary address (first one)
            let primaryAddress = contact.postalAddresses.first?.value
            let street = primaryAddress?.street.isEmpty == false ? primaryAddress?.street : nil
            let city = primaryAddress?.city.isEmpty == false ? primaryAddress?.city : nil
            let rawState = primaryAddress?.state.isEmpty == false ? primaryAddress?.state : nil
            let state = normalizeState(rawState)
            let zip = primaryAddress?.postalCode.isEmpty == false ? primaryAddress?.postalCode : nil
            let country = primaryAddress?.country.isEmpty == false ? primaryAddress?.country : nil
            
            // Get organization info
            let company = contact.organizationName.isEmpty ? nil : contact.organizationName
            let jobTitle = contact.jobTitle.isEmpty ? nil : contact.jobTitle
            
            contacts.append(ContactInfo(
                id: contact.identifier,
                displayName: displayName,
                firstName: firstName,
                lastName: lastName,
                email: primaryEmail,
                phone: primaryPhone,
                allEmails: allEmails,
                allPhones: allPhones,
                street: street,
                city: city,
                state: state,
                zip: zip,
                country: country,
                company: company,
                jobTitle: jobTitle
            ))
        }
    } catch {
        print("Error fetching contacts: \(error)")
    }
    
    return contacts
}

// Normalize states in Apple Contacts (writes back to contacts database)
func normalizeContactStates() -> (updated: Int, total: Int) {
    let store = CNContactStore()
    var updated = 0
    var total = 0
    
    // Fetch all keys needed for modification
    let keys: [CNKeyDescriptor] = [
        CNContactIdentifierKey as CNKeyDescriptor,
        CNContactGivenNameKey as CNKeyDescriptor,
        CNContactFamilyNameKey as CNKeyDescriptor,
        CNContactMiddleNameKey as CNKeyDescriptor,
        CNContactNamePrefixKey as CNKeyDescriptor,
        CNContactNameSuffixKey as CNKeyDescriptor,
        CNContactNicknameKey as CNKeyDescriptor,
        CNContactOrganizationNameKey as CNKeyDescriptor,
        CNContactDepartmentNameKey as CNKeyDescriptor,
        CNContactJobTitleKey as CNKeyDescriptor,
        CNContactPhoneNumbersKey as CNKeyDescriptor,
        CNContactEmailAddressesKey as CNKeyDescriptor,
        CNContactPostalAddressesKey as CNKeyDescriptor,
        CNContactUrlAddressesKey as CNKeyDescriptor,
        CNContactSocialProfilesKey as CNKeyDescriptor,
        CNContactInstantMessageAddressesKey as CNKeyDescriptor,
        CNContactBirthdayKey as CNKeyDescriptor,
        CNContactNonGregorianBirthdayKey as CNKeyDescriptor,
        CNContactDatesKey as CNKeyDescriptor,
        CNContactNoteKey as CNKeyDescriptor,
        CNContactImageDataKey as CNKeyDescriptor,
        CNContactThumbnailImageDataKey as CNKeyDescriptor,
        CNContactImageDataAvailableKey as CNKeyDescriptor,
        CNContactRelationsKey as CNKeyDescriptor,
        CNContactTypeKey as CNKeyDescriptor,
    ]
    
    let request = CNContactFetchRequest(keysToFetch: keys)
    
    do {
        try store.enumerateContacts(with: request) { contact, _ in
            total += 1
            
            // Check if any address needs normalization
            var needsUpdate = false
            var updatedAddresses: [(CNLabeledValue<CNPostalAddress>, CNMutablePostalAddress)] = []
            
            for labeledAddress in contact.postalAddresses {
                let address = labeledAddress.value
                if !address.state.isEmpty {
                    let normalized = normalizeState(address.state)
                    if normalized != address.state {
                        needsUpdate = true
                        let mutableAddress = CNMutablePostalAddress()
                        mutableAddress.street = address.street
                        mutableAddress.city = address.city
                        mutableAddress.state = normalized ?? address.state
                        mutableAddress.postalCode = address.postalCode
                        mutableAddress.country = address.country
                        updatedAddresses.append((labeledAddress, mutableAddress))
                    }
                }
            }
            
            if needsUpdate {
                let mutableContact = contact.mutableCopy() as! CNMutableContact
                
                // Replace addresses with normalized versions
                var newAddresses: [CNLabeledValue<CNPostalAddress>] = []
                for labeledAddress in contact.postalAddresses {
                    if let update = updatedAddresses.first(where: { $0.0 == labeledAddress }) {
                        newAddresses.append(CNLabeledValue(
                            label: labeledAddress.label,
                            value: update.1
                        ))
                    } else {
                        newAddresses.append(labeledAddress)
                    }
                }
                mutableContact.postalAddresses = newAddresses
                
                let saveRequest = CNSaveRequest()
                saveRequest.update(mutableContact)
                
                do {
                    try store.execute(saveRequest)
                    updated += 1
                } catch {
                    print("Failed to update contact: \(error)", to: &standardError)
                }
            }
        }
    } catch {
        print("Error enumerating contacts: \(error)", to: &standardError)
    }
    
    return (updated, total)
}

var standardError = FileHandle.standardError

extension FileHandle: TextOutputStream {
    public func write(_ string: String) {
        let data = Data(string.utf8)
        self.write(data)
    }
}

// Main entry point - outputs JSON to stdout
func main() {
    let args = CommandLine.arguments
    
    if args.count > 1 && args[1] == "fetch" {
        let contacts = fetchContacts()
        let encoder = JSONEncoder()
        if let data = try? encoder.encode(contacts),
           let json = String(data: data, encoding: .utf8) {
            print(json)
        } else {
            print("[]")
        }
    } else if args.count > 1 && args[1] == "request" {
        let granted = requestContactsAccess()
        print(granted ? "granted" : "denied")
    } else if args.count > 1 && args[1] == "normalize" {
        let result = normalizeContactStates()
        print("{\"updated\": \(result.updated), \"total\": \(result.total)}")
    } else {
        print("Usage: contacts_helper [fetch|request|normalize]")
    }
}

main()
