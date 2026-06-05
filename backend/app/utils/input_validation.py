"""
Enhanced Input Validation Framework
Comprehensive validation for all API inputs with detailed error messages
"""

from typing import Any, Dict, List, Optional, Callable, Union
from dataclasses import dataclass
from enum import Enum
import re
from datetime import datetime
import email_validator

from app.utils.logging_config import StructuredLogger

logger = StructuredLogger(__name__)


class ValidationType(Enum):
    """Validation types"""
    STRING = "string"
    EMAIL = "email"
    PHONE = "phone"
    URL = "url"
    UUID = "uuid"
    INTEGER = "integer"
    FLOAT = "float"
    BOOLEAN = "boolean"
    DATE = "date"
    DATETIME = "datetime"
    LIST = "list"
    DICT = "dict"
    ENUM = "enum"
    CUSTOM = "custom"


@dataclass
class ValidationRule:
    """Single validation rule"""
    field: str
    rule_type: ValidationType
    required: bool = True
    min_length: Optional[int] = None
    max_length: Optional[int] = None
    min_value: Optional[Union[int, float]] = None
    max_value: Optional[Union[int, float]] = None
    pattern: Optional[str] = None
    enum_values: Optional[List[Any]] = None
    custom_validator: Optional[Callable] = None
    error_message: Optional[str] = None


class FieldValidator:
    """Validate individual fields"""
    
    @staticmethod
    def validate_string(
        value: Any,
        field_name: str,
        min_length: int = 0,
        max_length: int = None,
        pattern: str = None,
        required: bool = True
    ) -> tuple[bool, Optional[str]]:
        """Validate string field"""
        
        if value is None:
            if required:
                return False, f"{field_name} is required"
            return True, None
        
        if not isinstance(value, str):
            return False, f"{field_name} must be a string"
        
        if len(value) < min_length:
            return False, f"{field_name} must be at least {min_length} characters"
        
        if max_length and len(value) > max_length:
            return False, f"{field_name} must not exceed {max_length} characters"
        
        if pattern:
            if not re.match(pattern, value):
                return False, f"{field_name} format is invalid"
        
        return True, None
    
    @staticmethod
    def validate_email(value: Any, field_name: str, required: bool = True) -> tuple[bool, Optional[str]]:
        """Validate email address"""
        
        if value is None:
            if required:
                return False, f"{field_name} is required"
            return True, None
        
        if not isinstance(value, str):
            return False, f"{field_name} must be a string"
        
        try:
            # Validate and normalize email
            valid = email_validator.validate_email(value)
            return True, None
        except email_validator.EmailNotValidError as e:
            return False, f"{field_name} is not a valid email: {str(e)}"
    
    @staticmethod
    def validate_phone(value: Any, field_name: str, required: bool = True) -> tuple[bool, Optional[str]]:
        """Validate phone number"""
        
        if value is None:
            if required:
                return False, f"{field_name} is required"
            return True, None
        
        if not isinstance(value, str):
            return False, f"{field_name} must be a string"
        
        # Remove common formatting
        cleaned = re.sub(r'[\s\-\(\)]', '', value)
        
        # Check if it's a valid phone number (10+ digits)
        if not re.match(r'^\+?1?\d{9,}$', cleaned):
            return False, f"{field_name} must be a valid phone number"
        
        return True, None
    
    @staticmethod
    def validate_url(value: Any, field_name: str, required: bool = True) -> tuple[bool, Optional[str]]:
        """Validate URL"""
        
        if value is None:
            if required:
                return False, f"{field_name} is required"
            return True, None
        
        if not isinstance(value, str):
            return False, f"{field_name} must be a string"
        
        url_pattern = r'^https?://[^\s/$.?#].[^\s]*$'
        if not re.match(url_pattern, value, re.IGNORECASE):
            return False, f"{field_name} must be a valid URL"
        
        return True, None
    
    @staticmethod
    def validate_uuid(value: Any, field_name: str, required: bool = True) -> tuple[bool, Optional[str]]:
        """Validate UUID"""
        
        if value is None:
            if required:
                return False, f"{field_name} is required"
            return True, None
        
        if not isinstance(value, str):
            return False, f"{field_name} must be a string"
        
        uuid_pattern = r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        if not re.match(uuid_pattern, value, re.IGNORECASE):
            return False, f"{field_name} must be a valid UUID"
        
        return True, None
    
    @staticmethod
    def validate_integer(
        value: Any,
        field_name: str,
        min_value: int = None,
        max_value: int = None,
        required: bool = True
    ) -> tuple[bool, Optional[str]]:
        """Validate integer"""
        
        if value is None:
            if required:
                return False, f"{field_name} is required"
            return True, None
        
        if not isinstance(value, int) or isinstance(value, bool):
            return False, f"{field_name} must be an integer"
        
        if min_value is not None and value < min_value:
            return False, f"{field_name} must be at least {min_value}"
        
        if max_value is not None and value > max_value:
            return False, f"{field_name} must not exceed {max_value}"
        
        return True, None
    
    @staticmethod
    def validate_float(
        value: Any,
        field_name: str,
        min_value: float = None,
        max_value: float = None,
        required: bool = True
    ) -> tuple[bool, Optional[str]]:
        """Validate float"""
        
        if value is None:
            if required:
                return False, f"{field_name} is required"
            return True, None
        
        if not isinstance(value, (int, float)) or isinstance(value, bool):
            return False, f"{field_name} must be a number"
        
        if min_value is not None and value < min_value:
            return False, f"{field_name} must be at least {min_value}"
        
        if max_value is not None and value > max_value:
            return False, f"{field_name} must not exceed {max_value}"
        
        return True, None
    
    @staticmethod
    def validate_list(
        value: Any,
        field_name: str,
        min_length: int = 0,
        max_length: int = None,
        required: bool = True
    ) -> tuple[bool, Optional[str]]:
        """Validate list"""
        
        if value is None:
            if required:
                return False, f"{field_name} is required"
            return True, None
        
        if not isinstance(value, list):
            return False, f"{field_name} must be a list"
        
        if len(value) < min_length:
            return False, f"{field_name} must have at least {min_length} items"
        
        if max_length and len(value) > max_length:
            return False, f"{field_name} must not exceed {max_length} items"
        
        return True, None
    
    @staticmethod
    def validate_enum(
        value: Any,
        field_name: str,
        allowed_values: List[Any],
        required: bool = True
    ) -> tuple[bool, Optional[str]]:
        """Validate enum"""
        
        if value is None:
            if required:
                return False, f"{field_name} is required"
            return True, None
        
        if value not in allowed_values:
            return False, f"{field_name} must be one of: {', '.join(map(str, allowed_values))}"
        
        return True, None


class RequestValidator:
    """Validate complete requests"""
    
    def __init__(self):
        self.field_validator = FieldValidator()
        self.rules: List[ValidationRule] = []
    
    def add_rule(self, rule: ValidationRule):
        """Add validation rule"""
        self.rules.append(rule)
        return self
    
    def add_string_rule(
        self,
        field: str,
        required: bool = True,
        min_length: int = 0,
        max_length: int = None,
        pattern: str = None,
        error_message: str = None
    ):
        """Add string validation rule"""
        self.rules.append(ValidationRule(
            field=field,
            rule_type=ValidationType.STRING,
            required=required,
            min_length=min_length,
            max_length=max_length,
            pattern=pattern,
            error_message=error_message
        ))
        return self
    
    def add_email_rule(self, field: str, required: bool = True, error_message: str = None):
        """Add email validation rule"""
        self.rules.append(ValidationRule(
            field=field,
            rule_type=ValidationType.EMAIL,
            required=required,
            error_message=error_message
        ))
        return self
    
    def add_phone_rule(self, field: str, required: bool = True, error_message: str = None):
        """Add phone validation rule"""
        self.rules.append(ValidationRule(
            field=field,
            rule_type=ValidationType.PHONE,
            required=required,
            error_message=error_message
        ))
        return self
    
    def add_integer_rule(
        self,
        field: str,
        required: bool = True,
        min_value: int = None,
        max_value: int = None,
        error_message: str = None
    ):
        """Add integer validation rule"""
        self.rules.append(ValidationRule(
            field=field,
            rule_type=ValidationType.INTEGER,
            required=required,
            min_value=min_value,
            max_value=max_value,
            error_message=error_message
        ))
        return self
    
    def add_enum_rule(
        self,
        field: str,
        allowed_values: List[Any],
        required: bool = True,
        error_message: str = None
    ):
        """Add enum validation rule"""
        self.rules.append(ValidationRule(
            field=field,
            rule_type=ValidationType.ENUM,
            required=required,
            enum_values=allowed_values,
            error_message=error_message
        ))
        return self
    
    def add_float_rule(
        self,
        field: str,
        required: bool = True,
        min_value: float = None,
        max_value: float = None,
        error_message: str = None
    ):
        """Add float validation rule"""
        self.rules.append(ValidationRule(
            field=field,
            rule_type=ValidationType.FLOAT,
            required=required,
            min_value=min_value,
            max_value=max_value,
            error_message=error_message
        ))
        return self
    
    def validate(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate data against all rules
        
        Returns:
            {
                "valid": bool,
                "errors": {field: [error_messages]},
                "warnings": [warning_messages],
                "cleaned_data": {validated data}
            }
        """
        
        result = {
            "valid": True,
            "errors": {},
            "warnings": [],
            "cleaned_data": {}
        }
        
        for rule in self.rules:
            field_value = data.get(rule.field)
            
            valid = False
            error_msg = None
            
            # Determine validation type
            if rule.rule_type == ValidationType.STRING:
                valid, error_msg = self.field_validator.validate_string(
                    field_value,
                    rule.field,
                    min_length=rule.min_length or 0,
                    max_length=rule.max_length,
                    pattern=rule.pattern,
                    required=rule.required
                )
            
            elif rule.rule_type == ValidationType.EMAIL:
                valid, error_msg = self.field_validator.validate_email(
                    field_value,
                    rule.field,
                    required=rule.required
                )
            
            elif rule.rule_type == ValidationType.PHONE:
                valid, error_msg = self.field_validator.validate_phone(
                    field_value,
                    rule.field,
                    required=rule.required
                )
            
            elif rule.rule_type == ValidationType.INTEGER:
                valid, error_msg = self.field_validator.validate_integer(
                    field_value,
                    rule.field,
                    min_value=rule.min_value,
                    max_value=rule.max_value,
                    required=rule.required
                )
            
            elif rule.rule_type == ValidationType.ENUM:
                valid, error_msg = self.field_validator.validate_enum(
                    field_value,
                    rule.field,
                    allowed_values=rule.enum_values or [],
                    required=rule.required
                )
            
            elif rule.rule_type == ValidationType.CUSTOM:
                if rule.custom_validator:
                    try:
                        valid, error_msg = rule.custom_validator(field_value)
                    except Exception as e:
                        valid = False
                        error_msg = f"Validation error: {str(e)}"
            
            # Add error if validation failed
            if not valid:
                result["valid"] = False
                error_to_add = rule.error_message or error_msg
                
                if rule.field not in result["errors"]:
                    result["errors"][rule.field] = []
                result["errors"][rule.field].append(error_to_add)
            else:
                # Add cleaned value to result
                if field_value is not None:
                    result["cleaned_data"][rule.field] = field_value
        
        if result["valid"]:
            logger.log_endpoint_request(
                endpoint="validation",
                status="success",
                metadata={"fields_validated": len(self.rules)}
            )
        else:
            logger.log_endpoint_request(
                endpoint="validation",
                status="failed",
                metadata={
                    "fields_validated": len(self.rules),
                    "errors": len(result["errors"])
                }
            )
        
        return result


# Validation presets for common scenarios
class ValidatorPresets:
    """Pre-built validators for common use cases"""
    
    @staticmethod
    def login_validator() -> RequestValidator:
        """Login form validator"""
        return (RequestValidator()
                .add_email_rule("email", required=True)
                .add_string_rule("password", required=True, min_length=8, max_length=128))
    
    @staticmethod
    def registration_validator() -> RequestValidator:
        """Registration form validator"""
        return (RequestValidator()
                .add_string_rule("name", required=True, min_length=2, max_length=100)
                .add_email_rule("email", required=True)
                .add_phone_rule("phone", required=True)
                .add_string_rule("password", required=True, min_length=8, max_length=128)
                .add_enum_rule("user_type", ["passenger", "driver"], required=True))
    
    @staticmethod
    def ride_request_validator() -> RequestValidator:
        """Ride request validator"""
        return (RequestValidator()
                .add_string_rule("pickup_location", required=True, min_length=5)
                .add_string_rule("dropoff_location", required=True, min_length=5)
                .add_integer_rule("passenger_count", required=True, min_value=1, max_value=6)
                .add_enum_rule("ride_type", ["standard", "premium", "shared"], required=True))
    
    @staticmethod
    def payment_validator() -> RequestValidator:
        """Payment validator"""
        return (RequestValidator()
                .add_string_rule("card_number", required=True, pattern=r'^\d{16}$')
                .add_string_rule("expiry", required=True, pattern=r'^\d{2}/\d{2}$')
                .add_string_rule("cvv", required=True, pattern=r'^\d{3,4}$')
                .add_float_rule("amount", required=True, min_value=0.01))
