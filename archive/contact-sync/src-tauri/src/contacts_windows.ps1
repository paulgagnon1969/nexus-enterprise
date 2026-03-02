# Windows Contacts Helper Script
# Fetches contacts from Windows People app / Outlook contacts

param(
    [string]$Action = "fetch"
)

# Function to normalize phone numbers
function Normalize-Phone {
    param([string]$phone)
    if ([string]::IsNullOrWhiteSpace($phone)) { return $null }
    return $phone.Trim()
}

# Function to normalize email
function Normalize-Email {
    param([string]$email)
    if ([string]::IsNullOrWhiteSpace($email)) { return $null }
    return $email.Trim().ToLower()
}

function Get-WindowsContacts {
    $contacts = @()
    
    # Method 1: Try Windows.ApplicationModel.Contacts (UWP API)
    try {
        Add-Type -AssemblyName 'Windows.ApplicationModel'
        $contactStore = [Windows.ApplicationModel.Contacts.ContactManager]::RequestStoreAsync([Windows.ApplicationModel.Contacts.ContactStoreAccessType]::AllContactsReadOnly).GetAwaiter().GetResult()
        
        if ($contactStore) {
            $reader = $contactStore.GetContactReader()
            $batch = $reader.ReadBatchAsync().GetAwaiter().GetResult()
            
            while ($batch.Contacts.Count -gt 0) {
                foreach ($contact in $batch.Contacts) {
                    $allEmails = @()
                    $allPhones = @()
                    
                    foreach ($email in $contact.Emails) {
                        $normalized = Normalize-Email $email.Address
                        if ($normalized) { $allEmails += $normalized }
                    }
                    
                    foreach ($phone in $contact.Phones) {
                        $normalized = Normalize-Phone $phone.Number
                        if ($normalized) { $allPhones += $normalized }
                    }
                    
                    $displayName = $contact.DisplayName
                    if ([string]::IsNullOrWhiteSpace($displayName)) {
                        $displayName = "$($contact.FirstName) $($contact.LastName)".Trim()
                    }
                    if ([string]::IsNullOrWhiteSpace($displayName)) {
                        $displayName = $null
                    }
                    
                    $contactObj = @{
                        id = $contact.Id
                        displayName = $displayName
                        firstName = if ([string]::IsNullOrWhiteSpace($contact.FirstName)) { $null } else { $contact.FirstName }
                        lastName = if ([string]::IsNullOrWhiteSpace($contact.LastName)) { $null } else { $contact.LastName }
                        email = if ($allEmails.Count -gt 0) { $allEmails[0] } else { $null }
                        phone = if ($allPhones.Count -gt 0) { $allPhones[0] } else { $null }
                        allEmails = $allEmails
                        allPhones = $allPhones
                    }
                    
                    # Only include if has email or phone
                    if ($contactObj.email -or $contactObj.phone) {
                        $contacts += $contactObj
                    }
                }
                
                $batch = $reader.ReadBatchAsync().GetAwaiter().GetResult()
            }
        }
    }
    catch {
        Write-Error "UWP Contacts API failed: $_"
    }
    
    # Method 2: Try Outlook COM if UWP didn't work or returned no contacts
    if ($contacts.Count -eq 0) {
        try {
            $outlook = New-Object -ComObject Outlook.Application
            $namespace = $outlook.GetNamespace("MAPI")
            $contactsFolder = $namespace.GetDefaultFolder(10) # olFolderContacts
            
            foreach ($item in $contactsFolder.Items) {
                if ($item.Class -eq 40) { # olContact
                    $allEmails = @()
                    $allPhones = @()
                    
                    # Collect emails
                    if ($item.Email1Address) { $allEmails += (Normalize-Email $item.Email1Address) }
                    if ($item.Email2Address) { $allEmails += (Normalize-Email $item.Email2Address) }
                    if ($item.Email3Address) { $allEmails += (Normalize-Email $item.Email3Address) }
                    $allEmails = $allEmails | Where-Object { $_ }
                    
                    # Collect phones
                    if ($item.MobileTelephoneNumber) { $allPhones += (Normalize-Phone $item.MobileTelephoneNumber) }
                    if ($item.BusinessTelephoneNumber) { $allPhones += (Normalize-Phone $item.BusinessTelephoneNumber) }
                    if ($item.HomeTelephoneNumber) { $allPhones += (Normalize-Phone $item.HomeTelephoneNumber) }
                    if ($item.Business2TelephoneNumber) { $allPhones += (Normalize-Phone $item.Business2TelephoneNumber) }
                    if ($item.Home2TelephoneNumber) { $allPhones += (Normalize-Phone $item.Home2TelephoneNumber) }
                    $allPhones = $allPhones | Where-Object { $_ }
                    
                    $displayName = $item.FullName
                    if ([string]::IsNullOrWhiteSpace($displayName)) {
                        $displayName = "$($item.FirstName) $($item.LastName)".Trim()
                    }
                    if ([string]::IsNullOrWhiteSpace($displayName)) {
                        $displayName = $null
                    }
                    
                    $contactObj = @{
                        id = $item.EntryID
                        displayName = $displayName
                        firstName = if ([string]::IsNullOrWhiteSpace($item.FirstName)) { $null } else { $item.FirstName }
                        lastName = if ([string]::IsNullOrWhiteSpace($item.LastName)) { $null } else { $item.LastName }
                        email = if ($allEmails.Count -gt 0) { $allEmails[0] } else { $null }
                        phone = if ($allPhones.Count -gt 0) { $allPhones[0] } else { $null }
                        allEmails = $allEmails
                        allPhones = $allPhones
                    }
                    
                    # Only include if has email or phone
                    if ($contactObj.email -or $contactObj.phone) {
                        $contacts += $contactObj
                    }
                }
            }
            
            [System.Runtime.Interopservices.Marshal]::ReleaseComObject($outlook) | Out-Null
        }
        catch {
            Write-Error "Outlook COM failed: $_"
        }
    }
    
    # Method 3: Try Windows Contacts folder (.contact files)
    if ($contacts.Count -eq 0) {
        $contactsPath = [Environment]::GetFolderPath('Contacts')
        if (Test-Path $contactsPath) {
            $contactFiles = Get-ChildItem -Path $contactsPath -Filter "*.contact" -Recurse -ErrorAction SilentlyContinue
            
            foreach ($file in $contactFiles) {
                try {
                    [xml]$xml = Get-Content $file.FullName
                    $ns = @{c = "http://schemas.microsoft.com/Contact"}
                    
                    $allEmails = @()
                    $allPhones = @()
                    
                    # Get emails
                    $emailNodes = Select-Xml -Xml $xml -XPath "//c:EmailAddress/c:Address" -Namespace $ns
                    foreach ($node in $emailNodes) {
                        $normalized = Normalize-Email $node.Node.InnerText
                        if ($normalized) { $allEmails += $normalized }
                    }
                    
                    # Get phones
                    $phoneNodes = Select-Xml -Xml $xml -XPath "//c:PhoneNumber/c:Number" -Namespace $ns
                    foreach ($node in $phoneNodes) {
                        $normalized = Normalize-Phone $node.Node.InnerText
                        if ($normalized) { $allPhones += $normalized }
                    }
                    
                    $firstName = (Select-Xml -Xml $xml -XPath "//c:NameCollection/c:Name/c:GivenName" -Namespace $ns).Node.InnerText
                    $lastName = (Select-Xml -Xml $xml -XPath "//c:NameCollection/c:Name/c:FamilyName" -Namespace $ns).Node.InnerText
                    $displayName = (Select-Xml -Xml $xml -XPath "//c:NameCollection/c:Name/c:FormattedName" -Namespace $ns).Node.InnerText
                    
                    if ([string]::IsNullOrWhiteSpace($displayName)) {
                        $displayName = "$firstName $lastName".Trim()
                    }
                    if ([string]::IsNullOrWhiteSpace($displayName)) {
                        $displayName = $null
                    }
                    
                    $contactObj = @{
                        id = $file.Name
                        displayName = $displayName
                        firstName = if ([string]::IsNullOrWhiteSpace($firstName)) { $null } else { $firstName }
                        lastName = if ([string]::IsNullOrWhiteSpace($lastName)) { $null } else { $lastName }
                        email = if ($allEmails.Count -gt 0) { $allEmails[0] } else { $null }
                        phone = if ($allPhones.Count -gt 0) { $allPhones[0] } else { $null }
                        allEmails = $allEmails
                        allPhones = $allPhones
                    }
                    
                    if ($contactObj.email -or $contactObj.phone) {
                        $contacts += $contactObj
                    }
                }
                catch {
                    # Skip invalid contact files
                }
            }
        }
    }
    
    return $contacts
}

# Main execution
switch ($Action) {
    "fetch" {
        $contacts = Get-WindowsContacts
        $contacts | ConvertTo-Json -Depth 10 -Compress
    }
    "request" {
        # On Windows, we typically don't need to request permission
        # But we can check if we have access
        Write-Output "granted"
    }
    default {
        Write-Output "Usage: contacts_windows.ps1 -Action [fetch|request]"
    }
}
