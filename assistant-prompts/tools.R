#' Parse a JSON string into an R data structure
#'
#' This function takes a JSON string as input and returns the corresponding
#' R data structure. It handles all standard JSON types:
#' - JSON objects become R named lists
#' - JSON arrays become R lists (or vectors if homogeneous)
#' - JSON strings become R character strings
#' - JSON numbers become R numeric values
#' - JSON booleans become R logical values
#' - JSON null becomes R NULL
#'
#' @param json_string A string containing valid JSON
#' @return An R data structure representing the JSON content
#' @examples
#' parse_json('{"name": "John", "age": 30, "hobbies": ["reading", "cycling"]}')
#' parse_json('[1, 2, 3, 4, 5]')
#' parse_json('{"valid": true, "data": null}')
parse_json <- function(json_string) {
  if (!is.character(json_string) || length(json_string) != 1) {
    stop("Input must be a single character string")
  }

  # Initialize the position
  pos <- 1

  # Function to get the current character
  current_char <- function() {
    if (pos <= nchar(json_string)) {
      return(substr(json_string, pos, pos))
    }
    return("")
  }

  # Function to advance position
  advance <- function() {
    pos <<- pos + 1
  }

  # Function to skip whitespace
  skip_whitespace <- function() {
    while (pos <= nchar(json_string) && grepl("^\\s$", current_char())) {
      advance()
    }
  }

  # Function to parse a string
  parse_string <- function() {
    # Skip the opening quote
    advance()

    start_pos <- pos
    escaped <- FALSE

    while (pos <= nchar(json_string)) {
      ch <- current_char()

      if (ch == "\\") {
        escaped <- !escaped
      } else if (ch == "\"" && !escaped) {
        break
      } else {
        escaped <- FALSE
      }

      advance()
    }

    # Extract the string content (without the closing quote)
    result <- substr(json_string, start_pos, pos - 1)

    # Handle escapes
    result <- gsub("\\\\\"", "\"", result)
    result <- gsub("\\\\\\\\", "\\\\", result)
    result <- gsub("\\\\n", "\n", result)
    result <- gsub("\\\\r", "\r", result)
    result <- gsub("\\\\t", "\t", result)
    result <- gsub("\\\\/", "/", result)

    # Handle Unicode escapes
    unicode_pattern <- "\\\\u([0-9A-Fa-f]{4})"
    while (grepl(unicode_pattern, result)) {
      unicode_match <- regexpr(unicode_pattern, result, perl = TRUE)
      if (unicode_match > 0) {
        hex_code <- substr(result, unicode_match + 2, unicode_match + 5)
        char_code <- strtoi(hex_code, 16L)
        unicode_char <- intToUtf8(char_code)

        before <- substr(result, 1, unicode_match - 1)
        after <- substr(result, unicode_match + 6, nchar(result))
        result <- paste0(before, unicode_char, after)
      } else {
        break
      }
    }

    # Skip the closing quote
    advance()

    return(result)
  }

  # Function to parse a number
  parse_number <- function() {
    start_pos <- pos

    # Handle negative numbers
    if (current_char() == "-") {
      advance()
    }

    # Handle integer part
    while (pos <= nchar(json_string) && grepl("^[0-9]$", current_char())) {
      advance()
    }

    # Handle decimal part
    if (current_char() == ".") {
      advance()
      while (pos <= nchar(json_string) && grepl("^[0-9]$", current_char())) {
        advance()
      }
    }

    # Handle exponent part
    if (tolower(current_char()) == "e") {
      advance()
      if (current_char() %in% c("+", "-")) {
        advance()
      }
      while (pos <= nchar(json_string) && grepl("^[0-9]$", current_char())) {
        advance()
      }
    }

    number_str <- substr(json_string, start_pos, pos - 1)
    return(as.numeric(number_str))
  }

  # Function to parse a literal (true, false, null)
  parse_literal <- function() {
    if (substr(json_string, pos, pos + 3) == "true") {
      pos <<- pos + 4
      return(TRUE)
    } else if (substr(json_string, pos, pos + 4) == "false") {
      pos <<- pos + 5
      return(FALSE)
    } else if (substr(json_string, pos, pos + 3) == "null") {
      pos <<- pos + 4
      return(NULL)
    } else {
      stop(paste0("Invalid literal at position ", pos))
    }
  }

  # Function to parse an array
  parse_array <- function() {
    result <- list()

    # Skip the opening bracket
    advance()
    skip_whitespace()

    # Handle empty array
    if (current_char() == "]") {
      advance()
      return(result)
    }

    # Parse array elements
    while (TRUE) {
      skip_whitespace()
      value <- parse_value()
      result <- c(result, list(value))

      skip_whitespace()
      if (current_char() == ",") {
        advance()
      } else if (current_char() == "]") {
        advance()
        break
      } else {
        stop(paste0("Expected ',' or ']' at position ", pos))
      }
    }

    # # Try to simplify homogeneous arrays to vectors
    # if (length(result) > 0) {
    #   # Check if all elements are of the same type
    #   types <- unique(sapply(result, function(x) class(x)[1]))

    #   if (length(types) == 1) {
    #     # Convert list to vector for primitive types
    #     if (types %in% c("character", "numeric", "logical", "integer")) {
    #       result <- unlist(result)
    #     }
    #   }
    # }

    return(result)
  }

  # Function to parse an object
  parse_object <- function() {
    # Create an empty named list
    result <- list(a = 1)[0]

    # Skip the opening brace
    advance()
    skip_whitespace()

    # Handle empty object
    if (current_char() == "}") {
      advance()
      return(result)
    }

    # Parse object key-value pairs
    while (TRUE) {
      skip_whitespace()

      if (current_char() != "\"") {
        stop(paste0("Expected string key at position ", pos))
      }

      key <- parse_string()

      skip_whitespace()
      if (current_char() != ":") {
        stop(paste0("Expected ':' at position ", pos))
      }
      advance()

      skip_whitespace()
      value <- parse_value()

      # Add the key-value pair to the result
      if (is.null(value)) {
        # Special handling of NULL so we don't delete the key
        result[key] <- list(NULL)
      } else {
        result[[key]] <- value
      }

      skip_whitespace()
      if (current_char() == ",") {
        advance()
      } else if (current_char() == "}") {
        advance()
        break
      } else {
        stop(paste0("Expected ',' or '}' at position ", pos))
      }
    }

    return(result)
  }

  # Function to parse any JSON value
  parse_value <- function() {
    skip_whitespace()

    ch <- current_char()

    if (ch == "{") {
      return(parse_object())
    } else if (ch == "[") {
      return(parse_array())
    } else if (ch == "\"") {
      return(parse_string())
    } else if (
      ch %in% c("-", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9")
    ) {
      return(parse_number())
    } else if (ch %in% c("t", "f", "n")) {
      return(parse_literal())
    } else {
      stop(paste0("Unexpected character '", ch, "' at position ", pos))
    }
  }

  # Start parsing from the root value
  result <- parse_value()

  # Check if there's any unparsed content
  skip_whitespace()
  if (pos <= nchar(json_string)) {
    warning(paste0(
      "Extra characters found after parsed JSON at position ",
      pos
    ))
  }

  return(result)
}

#' Convert an R object to a JSON string
#'
#' This function takes an R object and returns its JSON representation as a string.
#' It handles the following R types:
#' - Named lists become JSON objects
#' - Lists and vectors become JSON arrays
#' - Character strings become JSON strings
#' - Numeric values become JSON numbers
#' - Logical values become JSON booleans
#' - NULL becomes JSON null
#'
#' @param r_object An R object to convert to JSON
#' @param pretty Whether to format the JSON with indentation (default: FALSE)
#' @param indent_level Internal parameter for recursive pretty printing
#' @return A string containing the JSON representation
#' @examples
#' to_json(list(name = "John", age = 30, hobbies = c("reading", "cycling")))
#' to_json(1:5)
#' to_json(list(valid = TRUE, data = NULL))
to_json <- function(r_object, pretty = FALSE, indent_level = 0) {
  indent <- if (pretty) paste(rep("  ", indent_level), collapse = "") else ""
  next_indent <- if (pretty)
    paste(rep("  ", indent_level + 1), collapse = "") else ""

  if (is.null(r_object)) {
    return("null")
  } else if (is.logical(r_object)) {
    return(ifelse(r_object, "true", "false"))
  } else if (is.numeric(r_object)) {
    return(as.character(r_object))
  } else if (is.character(r_object)) {
    # Escape special characters
    r_object <- gsub("\\", "\\\\", r_object, fixed = TRUE)
    r_object <- gsub("\"", "\\\"", r_object, fixed = TRUE)
    r_object <- gsub("\n", "\\n", r_object, fixed = TRUE)
    r_object <- gsub("\r", "\\r", r_object, fixed = TRUE)
    r_object <- gsub("\t", "\\t", r_object, fixed = TRUE)

    return(paste0("\"", r_object, "\""))
  } else if (is.vector(r_object) || is.list(r_object)) {
    # Check if it's a named list (object)
    if (!is.null(names(r_object)) && !any(names(r_object) == "")) {
      components <- character(length(r_object))

      for (i in seq_along(r_object)) {
        key <- names(r_object)[i]
        value <- r_object[[i]]

        if (pretty) {
          components[i] <- paste0(
            next_indent,
            "\"",
            key,
            "\": ",
            to_json(value, pretty, indent_level + 1)
          )
        } else {
          components[i] <- paste0(
            "\"",
            key,
            "\":",
            to_json(value, pretty, indent_level + 1)
          )
        }
      }

      separator <- if (pretty) ",\n" else ","
      if (pretty && length(components) > 0) {
        return(paste0(
          "{\n",
          paste(components, collapse = separator),
          "\n",
          indent,
          "}"
        ))
      } else {
        return(paste0("{", paste(components, collapse = separator), "}"))
      }
    } else {
      # It's an array
      components <- vapply(
        r_object,
        function(x) {
          if (pretty) {
            paste0(next_indent, to_json(x, pretty, indent_level + 1))
          } else {
            to_json(x, pretty, indent_level + 1)
          }
        },
        character(1)
      )

      separator <- if (pretty) ",\n" else ","
      if (pretty && length(components) > 0) {
        return(paste0(
          "[\n",
          paste(components, collapse = separator),
          "\n",
          indent,
          "]"
        ))
      } else {
        return(paste0("[", paste(components, collapse = separator), "]"))
      }
    }
  } else if (inherits(r_object, "data.frame")) {
    # Convert data frame to list of rows
    rows <- lapply(seq_len(nrow(r_object)), function(i) {
      row_data <- as.list(r_object[i, , drop = FALSE])
      # Use column names as keys
      names(row_data) <- colnames(r_object)
      row_data
    })
    return(to_json(rows, pretty, indent_level))
  } else {
    stop(paste0(
      "Cannot convert object of class '",
      class(r_object)[1],
      "' to JSON"
    ))
  }
}

#' Parse JSON input from command line arguments
#'
#' This function is a convenience wrapper around `parse_json` that reads the
#' first command line argument and parses it as a JSON string.
#'
#' @return An R data structure representing the JSON content
parse_arg_json <- function() {
  args <- commandArgs(trailingOnly = TRUE)
  if (length(args) == 0) {
    stop("No JSON input provided")
  }
  parse_json(args[1])
}


#' Check the version of an installed package
#'
#' This function checks the version of an installed package and compares it to
#' a minimum required version. If the package is not installed, the version
#' will be `NULL` and the comparison will be `NULL`.
#'
#' @param pkg The name of the package to check
#' @param min_version The minimum required version (optional)
#' @return A list with the package name, installed version, minimum version,
#'   and whether the installed version is at least the minimum version
check_package_version <- function(package, min_version = NULL) {
  if (system.file(package = package) == "") {
    version <- NULL
    at_least_min_version <- NULL
  } else {
    version <- packageVersion(package)
    if (!is.null(min_version)) {
      at_least_min_version <- version >= min_version
    } else {
      at_least_min_version <- NULL
    }
  }

  list(
    language = "R",
    package = package,
    version = as.character(version),
    min_version = min_version,
    at_least_min_version = at_least_min_version
  )
}
