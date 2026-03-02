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
            
            contacts.append(ContactInfo(
                id: contact.identifier,
                displayName: displayName,
                firstName: firstName,
                lastName: lastName,
                email: primaryEmail,
                phone: primaryPhone,
                allEmails: allEmails,
                allPhones: allPhones
            ))
        }
    } catch {
        print("Error fetching contacts: \(error)")
    }
    
    return contacts
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
    } else {
        print("Usage: contacts_helper [fetch|request]")
    }
}

main()
